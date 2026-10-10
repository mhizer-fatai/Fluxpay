// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, SafeERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IInvestVenue} from "./interfaces/IInvestVenue.sol";
import {StockToken} from "./StockToken.sol";

/// @title InvestVault
/// @notice "Pay & Invest": USDC goes in, a tokenized-equity position comes out.
/// @dev Users keep per-account positions and can sell back to USDC at any time. The vault
///      never holds user cash — only the equity it buys on their behalf. The venue is
///      swappable (MockEquityVenue on testnet, an xStocks / Monday Trade adapter on
///      mainnet), so the product code never changes when the venue changes.
contract InvestVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    StockToken public immutable stock;
    IInvestVenue public venue;

    mapping(address => uint256) public stockOf;
    uint256 public totalStock;

    event Invested(address indexed account, uint256 usdcIn, uint256 stockOut);
    event Divested(address indexed account, uint256 stockIn, uint256 usdcOut);
    event VenueUpdated(address indexed venue);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientPosition();
    error VenueMismatch();

    constructor(IERC20 usdc_, StockToken stock_, IInvestVenue venue_) Ownable(msg.sender) {
        if (address(usdc_) == address(0) || address(stock_) == address(0) || address(venue_) == address(0)) {
            revert ZeroAddress();
        }
        if (venue_.stock() != address(stock_)) revert VenueMismatch();
        usdc = usdc_;
        stock = stock_;
        venue = venue_;
    }

    /// @notice Buy equity with `usdcAmount` USDC from the caller (approve the vault first).
    function invest(uint256 usdcAmount) external nonReentrant returns (uint256 stockOut) {
        if (usdcAmount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usdc.forceApprove(address(venue), usdcAmount);
        stockOut = venue.buy(usdcAmount, address(this));
        stockOf[msg.sender] += stockOut;
        totalStock += stockOut;
        emit Invested(msg.sender, usdcAmount, stockOut);
    }

    /// @notice Sell `stockAmount` of the caller's position back into USDC.
    function divest(uint256 stockAmount) external nonReentrant returns (uint256 usdcOut) {
        if (stockAmount == 0) revert ZeroAmount();
        if (stockOf[msg.sender] < stockAmount) revert InsufficientPosition();
        stockOf[msg.sender] -= stockAmount;
        totalStock -= stockAmount;
        // A real (DEX-based) venue pulls the stock via allowance; the mock burns it directly.
        stock.approve(address(venue), stockAmount);
        usdcOut = venue.sell(stockAmount, msg.sender);
        emit Divested(msg.sender, stockAmount, usdcOut);
    }

    /// @notice USD value (1e18) of an account's position at the current venue price.
    function positionValueX18(address account) external view returns (uint256) {
        return (stockOf[account] * venue.priceX18()) / 1e18;
    }

    /// @notice Swap the venue (e.g. mainnet adapter) — it must trade the same stock token.
    function setVenue(IInvestVenue next) external onlyOwner {
        if (address(next) == address(0)) revert ZeroAddress();
        if (next.stock() != address(stock)) revert VenueMismatch();
        venue = next;
        emit VenueUpdated(address(next));
    }
}
