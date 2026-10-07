// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title UsernameRegistry
/// @notice On-chain canonical truth for username <-> address binding.
/// @dev Off-chain services may cache this for lookup UX, but the address embedded in a
///      userOp/7702 calldata must be fetched from here at build time — a compromised
///      backend must never be able to redirect a payment.
contract UsernameRegistry {
    event UsernameRegistered(bytes32 indexed usernameHash, address indexed owner, string username);
    event UsernameTransferred(bytes32 indexed usernameHash, address indexed from, address indexed to);
    event UsernameReleased(bytes32 indexed usernameHash, address indexed owner);

    error NotOwner();
    error AlreadyRegistered(bytes32 usernameHash);
    error NotRegistered(bytes32 usernameHash);
    error Unauthorized(address caller);

    /// @dev keccak256(normalize(username)) -> owner address
    mapping(bytes32 => address) public ownerOf;
    mapping(bytes32 => uint64) public registeredAt;

    /// @dev Register msg.sender as the owner of `username`.
    ///      Callable by the account owner (EOA, 7702-delegated session account, or smart account).
    function register(bytes32 usernameHash, string calldata username) external {
        if (ownerOf[usernameHash] != address(0)) revert AlreadyRegistered(usernameHash);
        if (keccak256(bytes(username)) != usernameHash) revert Unauthorized(msg.sender);
        ownerOf[usernameHash] = msg.sender;
        registeredAt[usernameHash] = uint64(block.timestamp);
        emit UsernameRegistered(usernameHash, msg.sender, username);
    }

    /// @dev Transfer ownership of `usernameHash` to `to`. Only the current owner may call.
    function transfer(bytes32 usernameHash, address to) external {
        if (ownerOf[usernameHash] != msg.sender) revert NotOwner();
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
