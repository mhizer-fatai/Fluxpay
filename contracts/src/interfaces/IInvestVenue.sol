// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IInvestVenue
/// @notice Where invested USDC is converted into a tokenized-equity position and back.
/// @dev Testnet uses MockEquityVenue (Pyth-priced, simulated stock). On mainnet the same
///      interface is implemented by an xStocks or Monday Trade adapter — the vault and the
///      UI never change when the venue is swapped.
interface IInvestVenue {
    /// @return The stablecoin accepted by this venue (USDC).
    function usdc() external view returns (address);

    /// @return The equity token this venue mints/burns.
    function stock() external view returns (address);

    /// @return Current stock price in USDC, scaled by 1e18.
    function priceX18() external view returns (uint256);

    /// @notice Convert `usdcIn` USDC into stock, delivered to `to`.
    function buy(uint256 usdcIn, address to) external returns (uint256 stockOut);

    /// @notice Convert `stockIn` stock (pulled from the caller) back into USDC for `to`.
    function sell(uint256 stockIn, address to) external returns (uint256 usdcOut);
}
