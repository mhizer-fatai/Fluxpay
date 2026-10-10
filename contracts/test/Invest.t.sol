// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {StockToken} from "../src/StockToken.sol";
import {MockEquityVenue, IPyth} from "../src/MockEquityVenue.sol";
import {InvestVault} from "../src/InvestVault.sol";

/// @dev Minimal Pyth stand-in with a controllable price and publish time.
contract MockPyth {
    IPyth.Price public p;

    constructor(int64 price_, int32 expo_) {
        p = IPyth.Price(price_, 0, expo_, block.timestamp);
    }

    function set(int64 price_, int32 expo_, uint256 publishTime_) external {
        p = IPyth.Price(price_, 0, expo_, publishTime_);
    }

    function getPriceNoOlderThan(bytes32, uint256 age) external view returns (IPyth.Price memory) {
        require(block.timestamp - p.publishTime <= age, "stale");
        return p;
    }
}

contract InvestTest is Test {
    MockUSDC usdc;
    StockToken stock;
    MockPyth pyth;
    MockEquityVenue venue;
    InvestVault vault;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant PRICE_ID = keccak256("NVDA/USD");
    // Real Pyth NVDA value at build time: 22511000 with expo -5 => $225.11
    int64 constant NVDA_PRICE = 22_511_000;
    int32 constant NVDA_EXPO = -5;
    uint256 constant FEE_BPS = 25;
    uint256 constant FALLBACK = 22511e16; // $225.11

    function setUp() public {
        usdc = new MockUSDC();
        stock = new StockToken("NVIDIA xStock (simulated)", "NVDAx");
        pyth = new MockPyth(NVDA_PRICE, NVDA_EXPO);
        venue = new MockEquityVenue(IERC20(address(usdc)), stock, IPyth(address(pyth)), PRICE_ID, FEE_BPS, FALLBACK, 60);
        vault = new InvestVault(IERC20(address(usdc)), stock, venue);
        stock.setMinter(address(venue));

        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_PriceFromFreshPyth() public {
        assertEq(venue.priceX18(), 22511e16);
        assertEq(venue.priceSource(), "pyth");
    }

    function test_StalePythFallsBack() public {
        vm.warp(block.timestamp + 120);
        assertEq(venue.priceX18(), FALLBACK);
        assertEq(venue.priceSource(), "fallback");
    }

    function test_FallbackOnlyForcesFallback() public {
        venue.setFallbackOnly(true);
        assertEq(venue.priceSource(), "fallback");
        assertEq(venue.priceX18(), FALLBACK);
    }

    function test_BuyAppliesFeeAndMintsStock() public {
        vm.prank(alice);
        uint256 out = vault.invest(100e6);
        // 100 USDC - 0.25% fee = 99.75 USDC at $225.11 => 0.4431... NVDAx
        uint256 net = 9975e16;
        uint256 price = 22511e16;
        uint256 expected = (net * 1e18) / price;
        assertEq(out, expected);
        assertEq(stock.balanceOf(address(vault)), out);
        assertEq(vault.stockOf(alice), out);
        assertEq(vault.totalStock(), out);
        assertEq(usdc.balanceOf(address(venue)), 100e6);
    }

    function test_SellReturnsUsdc() public {
        vm.prank(alice);
        uint256 out = vault.invest(100e6);

        vm.prank(alice);
        uint256 usdcOut = vault.divest(out);
        // Gross 99.75 USDC minus 0.25% fee.
        assertApproxEqAbs(usdcOut, 99.500625e6, 2);
        assertEq(vault.stockOf(alice), 0);
        assertEq(vault.totalStock(), 0);
        assertEq(stock.balanceOf(address(vault)), 0);
    }

    function test_DivestMoreThanPositionReverts() public {
        vm.prank(alice);
        uint256 out = vault.invest(100e6);
        vm.prank(alice);
        vm.expectRevert(InvestVault.InsufficientPosition.selector);
        vault.divest(out + 1);
    }

    function test_TwoUsersKeepSeparatePositions() public {
        vm.prank(alice);
        uint256 a = vault.invest(100e6);
        vm.prank(bob);
        uint256 b = vault.invest(50e6);
        assertEq(vault.stockOf(alice), a);
        assertEq(vault.stockOf(bob), b);
        assertEq(vault.totalStock(), a + b);
        assertEq(stock.balanceOf(address(vault)), a + b);
    }

    function test_PositionValueTracksPrice() public {
        vm.prank(alice);
        uint256 out = vault.invest(100e6);
        // Immediately after buying, the position is worth what was paid minus the fee.
        assertApproxEqAbs(vault.positionValueX18(alice), (out * 22511e16) / 1e18, 2);

        // Price doubles -> position value doubles.
        pyth.set(NVDA_PRICE * 2, NVDA_EXPO, block.timestamp);
        assertApproxEqAbs(vault.positionValueX18(alice), ((out * 22511e16) / 1e18) * 2, 2);
    }

    function test_OnlyMinterCanMintOrBurn() public {
        vm.prank(alice);
        vm.expectRevert(StockToken.NotMinter.selector);
        stock.mint(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(StockToken.NotMinter.selector);
        stock.burn(alice, 1e18);
    }

    function test_SetVenueRequiresSameStock() public {
        StockToken other = new StockToken("Other", "OTH");
        MockEquityVenue otherVenue =
            new MockEquityVenue(IERC20(address(usdc)), other, IPyth(address(pyth)), PRICE_ID, FEE_BPS, FALLBACK, 60);
        vm.expectRevert(InvestVault.VenueMismatch.selector);
        vault.setVenue(otherVenue);
    }

    function test_ZeroAmountsRevert() public {
        vm.prank(alice);
        vm.expectRevert(MockEquityVenue.ZeroAmount.selector);
        venue.buy(0, alice);
        vm.prank(alice);
        vm.expectRevert(InvestVault.ZeroAmount.selector);
        vault.invest(0);
    }

    function test_SellWithoutVenueLiquidityReverts() public {
        // Someone else's stock cannot be sold by the vault — position accounting first.
        vm.prank(bob);
        vm.expectRevert(InvestVault.InsufficientPosition.selector);
        vault.divest(1);
    }
}
