// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626, IERC20} from "openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/// @title EarnVault
/// @notice ERC-4626 vault for idle balances: deposit an asset, receive shares that
///         appreciate as the attached strategy earns.
/// @dev The vault is strategy-agnostic. It reads value from `strategy.totalValue()` and
///      routes deposits/withdrawals through the strategy, so swapping the strategy changes
///      where the yield comes from without touching vault code or the UI.
contract EarnVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IYieldStrategy public strategy;

    event StrategyUpdated(address indexed strategy);

    error ZeroAddress();
    error StrategyAssetMismatch();
    error StrategyUnchanged();

    constructor(IERC20 asset_, IYieldStrategy strategy_, string memory vaultName, string memory vaultSymbol)
        ERC4626(asset_)
        ERC20(vaultName, vaultSymbol)
        Ownable(msg.sender)
    {
        if (address(strategy_) == address(0)) revert ZeroAddress();
        if (strategy_.asset() != address(asset_)) revert StrategyAssetMismatch();
        strategy = strategy_;
    }

    /// @dev Reported value is whatever the strategy says the position is worth.
    function totalAssets() public view override returns (uint256) {
        return strategy.totalValue();
    }

    /// @notice Swap the yield source, moving all assets from the old strategy atomically.
    /// @dev Without the migration step the vault would report the (empty) new strategy's
    ///      value while the old one still held the funds — share pricing would break and
    ///      the assets would be stranded.
    function setStrategy(IYieldStrategy next) external onlyOwner nonReentrant {
        if (address(next) == address(0)) revert ZeroAddress();
        if (address(next) == address(strategy)) revert StrategyUnchanged();
        if (next.asset() != asset()) revert StrategyAssetMismatch();

        IYieldStrategy prev = strategy;
        uint256 assets = prev.totalValue();
        if (assets > 0) {
            prev.withdraw(assets, address(this));
            IERC20(asset()).forceApprove(address(next), assets);
            next.deposit(assets);
        }
        strategy = next;
        emit StrategyUpdated(address(next));
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._deposit(caller, receiver, assets, shares);
        IERC20(asset()).forceApprove(address(strategy), assets);
        strategy.deposit(assets);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        strategy.withdraw(assets, address(this));
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
