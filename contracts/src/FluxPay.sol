// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20, IERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FluxPay
/// @notice P2P settlement to username-registered recipients, with atomic batches.
/// @dev Non-custodial: token moves directly from sender to recipient(s) in the same tx.
///      Sender pre-approves this contract (Permit2 or direct allowance). No funds ever
///      sit in this contract.
contract FluxPay {
    using SafeERC20 for IERC20;

    event PaymentSettled(address indexed from, address indexed to, uint256 amount, address indexed token);
    event BatchSettled(address indexed from, uint256 total, uint256 count, address indexed token);

    error ZeroAmount();
    error ZeroAddress();
    error BatchMismatch();

    /// @dev Send `amount` of `token` from msg.sender to `to`.
    function settle(address token, address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, to, amount);
        emit PaymentSettled(msg.sender, to, amount, token);
    }

    /// @dev Atomic batch: send N transfers in one tx. Reverts entirely on any failure.
    function settleBatch(address token, address[] calldata tos, uint256[] calldata amounts)
        external
        returns (uint256 total)
    {
        uint256 n = tos.length;
        if (n != amounts.length || n == 0) revert BatchMismatch();
        for (uint256 i; i < n; ++i) {
            if (tos[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            total += amounts[i];
        }
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        for (uint256 i; i < n; ++i) {
            IERC20(token).safeTransfer(tos[i], amounts[i]);
            emit PaymentSettled(msg.sender, tos[i], amounts[i], token);
        }
        emit BatchSettled(msg.sender, total, n, token);
    }
}
