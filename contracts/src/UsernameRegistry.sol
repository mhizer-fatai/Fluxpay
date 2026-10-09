// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title UsernameRegistry
/// @notice On-chain canonical truth for username <-> address binding.
/// @dev Registration is commit-reveal: a plain first-come register() can be front-run
///      from the mempool (an observer takes the name first). Commit a hash, wait, then
///      reveal the name — an attacker who sees the reveal can no longer take it first.
///      Off-chain services may cache this for lookup UX, but the address embedded in a
///      userOp calldata must be fetched from here at build time — a compromised backend
///      must never be able to redirect a payment.
contract UsernameRegistry {
    event UsernameCommitted(address indexed owner, bytes32 commitment);
    event UsernameRegistered(bytes32 indexed usernameHash, address indexed owner, string username);
    event UsernameTransferred(bytes32 indexed usernameHash, address indexed from, address indexed to);
    event UsernameReleased(bytes32 indexed usernameHash, address indexed owner);

    error NotOwner();
    error AlreadyRegistered(bytes32 usernameHash);
    error NotRegistered(bytes32 usernameHash);
    error Unauthorized(address caller);
    error ZeroAddress();
    error CommitmentMissing();
    error CommitmentTooFresh();
    error CommitmentExpired();

    struct Commitment {
        bytes32 hash;
        uint64 at;
    }

    /// @dev keccak256(normalize(username)) -> owner address
    mapping(bytes32 => address) public ownerOf;
    mapping(bytes32 => uint64) public registeredAt;
    /// @dev committer -> pending commitment (cleared on reveal)
    mapping(address => Commitment) public commitments;

    /// @dev A reveal must come strictly after its commit and within a day, so a stale
    ///      commitment cannot be revealed much later (e.g. after the name gains value).
    uint256 public constant COMMIT_MAX_AGE = 1 days;

    /// @notice Commit to a username: commitment = keccak256(abi.encode(usernameHash, salt)).
    function commit(bytes32 commitment) external {
        commitments[msg.sender] = Commitment({hash: commitment, at: uint64(block.timestamp)});
        emit UsernameCommitted(msg.sender, commitment);
    }

    /// @notice Reveal a previously committed username and become its owner.
    function reveal(bytes32 usernameHash, string calldata username, bytes32 salt) external {
        Commitment memory c = commitments[msg.sender];
        if (c.hash == bytes32(0)) revert CommitmentMissing();
        if (c.hash != keccak256(abi.encode(usernameHash, salt))) revert Unauthorized(msg.sender);
        if (block.timestamp <= c.at) revert CommitmentTooFresh();
        if (block.timestamp > c.at + COMMIT_MAX_AGE) revert CommitmentExpired();
        if (ownerOf[usernameHash] != address(0)) revert AlreadyRegistered(usernameHash);
        if (keccak256(bytes(username)) != usernameHash) revert Unauthorized(msg.sender);

        delete commitments[msg.sender];
        ownerOf[usernameHash] = msg.sender;
        registeredAt[usernameHash] = uint64(block.timestamp);
        emit UsernameRegistered(usernameHash, msg.sender, username);
    }

    /// @notice Release a username you own, freeing it for registration again.
    function release(bytes32 usernameHash) external {
        if (ownerOf[usernameHash] != msg.sender) revert NotOwner();
        delete ownerOf[usernameHash];
        delete registeredAt[usernameHash];
        emit UsernameReleased(usernameHash, msg.sender);
    }

    /// @dev Transfer ownership of `usernameHash` to `to`. Only the current owner may call.
    function transfer(bytes32 usernameHash, address to) external {
        if (ownerOf[usernameHash] != msg.sender) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        emit UsernameTransferred(usernameHash, msg.sender, to);
        ownerOf[usernameHash] = to;
    }

    /// @dev Resolve a username to its owner address.
    function resolve(bytes32 usernameHash) external view returns (address) {
        address owner = ownerOf[usernameHash];
        if (owner == address(0)) revert NotRegistered(usernameHash);
        return owner;
    }
}
