// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20, IERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PaymentLinkEscrow
/// @notice Recipient-bound payment links, claimable by ephemeral-key proof — anti front-running.
/// @dev Model (SYSTEM_DESIGN.md §4.2): a link's secret is an ephemeral signing key `e`
///      (pubkey E, kept off-chain). Depositing records E but not `e`. To claim, the holder
///      signs claimDigest(linkId, claimer) with `e`; because the digest binds `claimer`, a
///      mempool observer cannot replay the signature to redirect funds to themselves.
///      Optionally bind to a single recipient (`recipientAllowed != 0`). After `expiry`,
///      the depositor may refund.
contract PaymentLinkEscrow {
    using SafeERC20 for IERC20;

    struct Link {
        address depositor;
        address token;
        uint256 amount;
        uint40 expiry;
        address recipientAllowed; // 0 == anyone holding the secret may claim
        address ephemeralSigner; // recovered pubkey address of the link secret
        bool claimed;
        bool refunded;
    }

    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(bytes32 linkId,address claimer)");
    bytes32 public immutable DOMAIN_SEPARATOR;

    event LinkCreated(
        bytes32 indexed linkId, address indexed depositor, address indexed token, uint256 amount, uint40 expiry
    );
    event LinkClaimed(bytes32 indexed linkId, address indexed claimer, address indexed token, uint256 amount);
    event LinkRefunded(bytes32 indexed linkId, address indexed depositor, uint256 amount);

    error AlreadyClaimed();
    error AlreadyRefunded();
    error Expired();
    error NotYetExpired();
    error NotDepositor();
    error BadSignature();
    error LinkNotFound();
    error ZeroAmount();
    error ZeroAddress();

    mapping(bytes32 => Link) public links;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Metro Payment Link"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Create a link. msg.sender is the depositor and funds the escrow.
    function deposit(
        bytes32 linkId,
        address token,
        uint256 amount,
        uint40 expiry,
        address ephemeralSigner,
        address recipientAllowed
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (ephemeralSigner == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp) revert Expired();
        if (links[linkId].depositor != address(0)) revert AlreadyClaimed(); // linkId collision

        links[linkId] = Link({
            depositor: msg.sender,
            token: token,
            amount: amount,
            expiry: expiry,
            recipientAllowed: recipientAllowed,
            ephemeralSigner: ephemeralSigner,
            claimed: false,
            refunded: false
        });
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LinkCreated(linkId, msg.sender, token, amount, expiry);
    }

    /// @notice Claim `linkId` for `claimer`, proving possession of the link secret.
    /// @param sig The EIP-712 signature over Claim(linkId, claimer), made by the secret key.
    function claim(bytes32 linkId, address claimer, bytes calldata sig) external {
        Link storage l = links[linkId];
        if (l.depositor == address(0)) revert LinkNotFound();
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (block.timestamp >= l.expiry) revert Expired();
        if (l.recipientAllowed != address(0) && claimer != l.recipientAllowed) revert BadSignature();

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, _claimDigest(linkId, claimer)));
        address recovered = _recover(digest, sig);
        if (recovered != l.ephemeralSigner) revert BadSignature();

        l.claimed = true;
        IERC20(l.token).safeTransfer(claimer, l.amount);
        emit LinkClaimed(linkId, claimer, l.token, l.amount);
    }

    /// @notice Depositor refunds after expiry. Callable by anyone after expiry could be
    ///         opened up later with a caller bounty ([prod], §4.2); depositor-only for [v1].
    function refund(bytes32 linkId) external {
        Link storage l = links[linkId];
        if (l.depositor == address(0)) revert LinkNotFound();
        if (msg.sender != l.depositor) revert NotDepositor();
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (block.timestamp < l.expiry) revert NotYetExpired();

        l.refunded = true;
        IERC20(l.token).safeTransfer(l.depositor, l.amount);
        emit LinkRefunded(linkId, l.depositor, l.amount);
    }

    function _claimDigest(bytes32 linkId, address claimer) internal pure returns (bytes32) {
        return keccak256(abi.encode(CLAIM_TYPEHASH, linkId, claimer));
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert BadSignature();
        if (v != 27 && v != 28) revert BadSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadSignature();
        return recovered;
    }
}
