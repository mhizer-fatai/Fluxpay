// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IYieldStrategy
/// @notice Pluggable yield source for EarnVault.
/// @dev The vault only reads `totalValue()` and moves assets in and out. Where the yield
///      actually comes from is the strategy's concern, so the same vault works with a
///      simulated source on testnet and a real lending market (Curvance, Aave, Morpho) on
///      mainnet without changing vault code or the UI.
interface IYieldStrategy {
    /// @return The ERC-20 asset this strategy accepts. Must match the vault's asset.
    function asset() external view returns (address);

    /// @return Value of the position in asset units, including accrued yield.
    function totalValue() external view returns (uint256);

    /// @notice Pull `amount` of the asset from the caller into the strategy.
    function deposit(uint256 amount) external;

    /// @notice Send `amount` of the asset to `to`, reducing the position.
    function withdraw(uint256 amount, address to) external;
}
