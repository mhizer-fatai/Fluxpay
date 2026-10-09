// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, SafeERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/// @title MockYieldStrategy
/// @notice Testnet yield source for EarnVault. Accrues a fixed per-second rate on the
///         deployed principal, paid out of a pre-funded reserve.
/// @dev Simple interest, not compounded: pending = principal * ratePerSecondX18 * elapsed / 1e18,
///      capped by the reserve. Withdrawals fold pending yield into principal first, so the
///      invariant `asset.balanceOf(this) == principal + reserve` always holds and the strategy
///      can never promise more than it holds.
contract MockYieldStrategy is IYieldStrategy, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlying;
    uint256 public principal;
    uint256 public reserve;
    uint256 public ratePerSecondX18;
    uint64 public lastAccrual;

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount, address indexed to);
    event YieldFunded(uint256 amount);
    event RateUpdated(uint256 ratePerSecondX18);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientPrincipal();

    constructor(IERC20 asset_, uint256 ratePerSecondX18_) Ownable(msg.sender) {
        if (address(asset_) == address(0)) revert ZeroAddress();
        underlying = asset_;
        ratePerSecondX18 = ratePerSecondX18_;
        lastAccrual = uint64(block.timestamp);
    }

    function asset() external view returns (address) {
        return address(underlying);
    }

    /// @notice Yield accrued since the last realisation, capped by the reserve.
    function pendingYield() public view returns (uint256) {
        if (ratePerSecondX18 == 0 || principal == 0) return 0;
        uint256 elapsed = block.timestamp - lastAccrual;
        uint256 accrued = (principal * ratePerSecondX18 * elapsed) / 1e18;
        return accrued > reserve ? reserve : accrued;
    }

    function totalValue() external view returns (uint256) {
        return principal + pendingYield();
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _realize();
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        principal += amount;
        emit Deposited(amount);
    }

    function withdraw(uint256 amount, address to) external {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        _realize();
        if (amount > principal) revert InsufficientPrincipal();
        principal -= amount;
        underlying.safeTransfer(to, amount);
        emit Withdrawn(amount, to);
    }

    /// @notice Seed the yield pool that backs future accrual. In production this is the
    ///         interest the underlying protocol pays (Curvance, Aave, Morpho).
    function fundYield(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        reserve += amount;
        emit YieldFunded(amount);
    }

    function setRate(uint256 ratePerSecondX18_) external onlyOwner {
        _realize();
        ratePerSecondX18 = ratePerSecondX18_;
        emit RateUpdated(ratePerSecondX18_);
    }

    /// @dev Fold accrued yield into principal, consuming the matching reserve.
    function _realize() internal {
        uint256 pending = pendingYield();
        if (pending > 0) {
            reserve -= pending;
            principal += pending;
        }
        lastAccrual = uint64(block.timestamp);
    }
}
