// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, SafeERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IInvestVenue} from "./interfaces/IInvestVenue.sol";
import {StockToken} from "./StockToken.sol";

/// @dev Minimal, ABI-compatible Pyth interface — no external SDK dependency.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory);
}

interface IERC20MetadataLike {
    function decimals() external view returns (uint8);
}

/// @title MockEquityVenue
/// @notice Testnet venue: USDC <-> simulated equity at the live Pyth price.
/// @dev Primary price source is Pyth (`getPriceNoOlderThan`). Monad's testnet feed is not
///      continuously pushed, so a fallback price (seeded from the last real Pyth value) keeps
///      the demo working; `priceSource()` tells the UI which one is in use. A real venue
///      (xStocks / Monday Trade) replaces this contract on mainnet behind `IInvestVenue`.
contract MockEquityVenue is IInvestVenue, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdcToken;
    StockToken public immutable stockToken;
    IPyth public immutable pyth;
    bytes32 public immutable priceId;
    /// @dev Fee taken on both buy and sell, in basis points.
    uint256 public immutable feeBps;
    /// @dev 10 ** (18 - usdcDecimals + stockDecimals): converts between raw USDC (6dp),
    ///      X18 USD value and raw stock units (18dp). USDC has 6 decimals and the stock 18,
    ///      so this is 1e30 — forgetting it silently misprices by 1e12.
    uint256 public immutable scale;
    /// @dev How old a Pyth price may be before the fallback is used.
    uint256 public maxPriceAge;

    uint256 public fallbackPriceX18;
    bool public fallbackOnly;

    event Bought(address indexed from, address indexed to, uint256 usdcIn, uint256 stockOut, uint256 priceX18);
    event Sold(address indexed from, address indexed to, uint256 stockIn, uint256 usdcOut, uint256 priceX18);
    event FallbackPriceUpdated(uint256 priceX18);
    event FallbackOnlyUpdated(bool fallbackOnly);
    event MaxPriceAgeUpdated(uint256 seconds_);

    error ZeroAmount();
    error ZeroAddress();
    error BadPrice();
    error InsufficientUsdc();
    error MaxFee();

    constructor(
        IERC20 usdc_,
        StockToken stock_,
        IPyth pyth_,
        bytes32 priceId_,
        uint256 feeBps_,
        uint256 fallbackPriceX18_,
        uint256 maxPriceAge_
    ) Ownable(msg.sender) {
        if (address(usdc_) == address(0) || address(stock_) == address(0)) revert ZeroAddress();
        if (feeBps_ > 500) revert MaxFee(); // 5% ceiling
        if (fallbackPriceX18_ == 0) revert BadPrice();
        uint8 usdcDec = IERC20MetadataLike(address(usdc_)).decimals();
        uint8 stockDec = stock_.decimals();
        if (18 + stockDec < usdcDec) revert BadPrice();
        usdcToken = usdc_;
        stockToken = stock_;
        pyth = pyth_;
        priceId = priceId_;
        feeBps = feeBps_;
        scale = 10 ** (18 + stockDec - usdcDec);
        fallbackPriceX18 = fallbackPriceX18_;
        maxPriceAge = maxPriceAge_;
    }

    function usdc() external view returns (address) {
        return address(usdcToken);
    }

    function stock() external view returns (address) {
        return address(stockToken);
    }

    /// @notice Current price in USDC (1e18-scaled), from Pyth when fresh, else the fallback.
    function priceX18() public view returns (uint256) {
        if (!fallbackOnly) {
            try pyth.getPriceNoOlderThan(priceId, maxPriceAge) returns (IPyth.Price memory p) {
                return _scale(p.price, p.expo);
            } catch {
                /* stale or unavailable — fall through to the fallback */
            }
        }
        return fallbackPriceX18;
    }

    /// @notice "pyth" when the oracle is fresh, "fallback" otherwise — for honest UI labels.
    function priceSource() external view returns (string memory) {
        if (!fallbackOnly) {
            try pyth.getPriceNoOlderThan(priceId, maxPriceAge) returns (IPyth.Price memory) {
                return "pyth";
            } catch {
                /* fall through */
            }
        }
        return "fallback";
    }

    function buy(uint256 usdcIn, address to) external nonReentrant returns (uint256 stockOut) {
        if (usdcIn == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        uint256 price = priceX18();
        usdcToken.safeTransferFrom(msg.sender, address(this), usdcIn);
        uint256 net = usdcIn - (usdcIn * feeBps) / 10_000;
        stockOut = (net * scale) / price;
        if (stockOut == 0) revert ZeroAmount();
        stockToken.mint(to, stockOut);
        emit Bought(msg.sender, to, usdcIn, stockOut, price);
    }

    function sell(uint256 stockIn, address to) external nonReentrant returns (uint256 usdcOut) {
        if (stockIn == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        uint256 price = priceX18();
        stockToken.burn(msg.sender, stockIn);
        uint256 gross = (stockIn * price) / scale;
        usdcOut = gross - (gross * feeBps) / 10_000;
        if (usdcOut == 0) revert ZeroAmount();
        if (usdcToken.balanceOf(address(this)) < usdcOut) revert InsufficientUsdc();
        usdcToken.safeTransfer(to, usdcOut);
        emit Sold(msg.sender, to, stockIn, usdcOut, price);
    }

    // ------------------------------------------------------------------ owner

    function setFallbackPrice(uint256 priceX18_) external onlyOwner {
        if (priceX18_ == 0) revert BadPrice();
        fallbackPriceX18 = priceX18_;
        emit FallbackPriceUpdated(priceX18_);
    }

    function setFallbackOnly(bool on) external onlyOwner {
        fallbackOnly = on;
        emit FallbackOnlyUpdated(on);
    }

    function setMaxPriceAge(uint256 seconds_) external onlyOwner {
        maxPriceAge = seconds_;
        emit MaxPriceAgeUpdated(seconds_);
    }

    // ------------------------------------------------------------------ internal

    function _scale(int64 price, int32 expo) internal pure returns (uint256) {
        if (price <= 0) revert BadPrice();
        uint256 p = uint256(uint64(price));
        int256 e = int256(expo) + 18;
        if (e >= 0) return p * (10 ** uint256(e));
        return p / (10 ** uint256(-e));
    }
}
