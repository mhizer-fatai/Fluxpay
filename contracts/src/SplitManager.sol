// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20, IERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SplitManager
/// @notice Bill splitting, [v1] disburse mode only.
/// @dev Disburse: one payer settles N recipients atomically (group dinner). Collect mode
///      (organizer pulls pre-authorized payments via permit/session keys) is [prod] — see
///      SYSTEM_DESIGN.md §4.3.
contract SplitManager {
    using SafeERC20 for IERC20;

    event SplitSettled(address indexed payer, uint256 total, uint256 count, address indexed token);

    error ZeroAmount();
    error ZeroAddress();
    error BatchMismatch();

    /// @dev Payer (via their account) settles `shares` across `payees`.
    function disburse(address token, address[] calldata payees, uint256[] calldata shares)
        external
        returns (uint256 total)
    {
        uint256 n = payees.length;
        if (n != shares.length || n == 0) revert BatchMismatch();
        for (uint256 i; i < n; ++i) {
            if (payees[i] == address(0)) revert ZeroAddress();
            if (shares[i] == 0) revert ZeroAmount();
            total += shares[i];
        }
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        for (uint256 i; i < n; ++i) {
            IERC20(token).safeTransfer(payees[i], shares[i]);
        }
        emit SplitSettled(msg.sender, total, n, token);
    }
}
