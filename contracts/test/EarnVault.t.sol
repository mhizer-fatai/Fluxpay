// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {EarnVault} from "../src/EarnVault.sol";

/// @dev 5% per year, simple interest: 0.05e18 / 31_536_000 per second, scaled by 1e18.
contract EarnVaultTest is Test {
    MockUSDC usdc;
    MockYieldStrategy strategy;
    EarnVault vault;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant RATE_X18 = 1_585_489_599; // 5% per year, simple: 5e16 / 31_536_000
    uint256 constant YEAR = 365 days;
    uint256 constant YIELD_RESERVE = 100e6; // 100 USDC of subsidy

    function setUp() public {
        usdc = new MockUSDC();
        strategy = new MockYieldStrategy(IERC20(address(usdc)), RATE_X18);
        vault = new EarnVault(IERC20(address(usdc)), strategy, "FluxPay Earn USDC", "fpUSDC");

        usdc.mint(address(this), 1_000_000e6);
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);

        usdc.approve(address(strategy), type(uint256).max);
        strategy.fundYield(YIELD_RESERVE);

        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount, who);
    }

    function test_DepositMintsSharesOneToOne() public {
        uint256 shares = _deposit(alice, 100e6);
        assertEq(shares, 100e6);
        assertEq(vault.totalAssets(), 100e6);
        assertEq(strategy.principal(), 100e6);
        // Yield reserve sits in the strategy but is not vault value until it accrues.
        assertEq(usdc.balanceOf(address(strategy)), YIELD_RESERVE + 100e6);
    }

    function test_ValueAccruesOverTime() public {
        _deposit(alice, 100e6);
        vm.warp(block.timestamp + YEAR);
        // ~5% simple interest on 100 USDC.
        assertApproxEqAbs(vault.totalAssets(), 105e6, 2);
        assertApproxEqAbs(vault.convertToAssets(vault.balanceOf(alice)), 105e6, 2);
    }

    function test_WithdrawPaysPrincipalPlusYield() public {
        _deposit(alice, 100e6);
        vm.warp(block.timestamp + YEAR);

        uint256 before = usdc.balanceOf(alice);
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);

        assertApproxEqAbs(assets, 105e6, 2);
        assertEq(usdc.balanceOf(alice) - before, assets);
        assertLe(vault.totalAssets(), 2); // ERC-4626 rounding dust, not real value
        assertEq(vault.totalSupply(), 0);
    }

    function test_NoYieldWithoutReserve() public {
        // A second vault with no yield subsidy must stay flat.
        MockYieldStrategy dry = new MockYieldStrategy(IERC20(address(usdc)), RATE_X18);
        EarnVault dryVault = new EarnVault(IERC20(address(usdc)), dry, "Dry", "dryUSDC");
        vm.prank(alice);
        usdc.approve(address(dryVault), type(uint256).max);
        vm.prank(alice);
        dryVault.deposit(100e6, alice);

        vm.warp(block.timestamp + YEAR);
        assertEq(dryVault.totalAssets(), 100e6);

        uint256 dryShares = dryVault.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = dryVault.redeem(dryShares, alice, alice);
        assertApproxEqAbs(assets, 100e6, 2);
    }

    function test_YieldIsCappedByReserve() public {
        // Reserve is smaller than what the rate would accrue in a year.
        MockYieldStrategy small = new MockYieldStrategy(IERC20(address(usdc)), RATE_X18);
        EarnVault smallVault = new EarnVault(IERC20(address(usdc)), small, "Small", "smUSDC");
        usdc.approve(address(small), type(uint256).max);
        small.fundYield(1e6); // 1 USDC only

        vm.prank(alice);
        usdc.approve(address(smallVault), type(uint256).max);
        vm.prank(alice);
        smallVault.deposit(100e6, alice);

        vm.warp(block.timestamp + YEAR);
        assertEq(smallVault.totalAssets(), 101e6);
    }

    function test_TwoDepositorsShareYieldProportionally() public {
        _deposit(alice, 100e6);
        _deposit(bob, 300e6);
        vm.warp(block.timestamp + YEAR);

        // Vault grew 5% on 400 USDC principal.
        assertApproxEqAbs(vault.totalAssets(), 420e6, 3);

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobShares = vault.balanceOf(bob);
        vm.prank(alice);
        uint256 aliceAssets = vault.redeem(aliceShares, alice, alice);
        vm.prank(bob);
        uint256 bobAssets = vault.redeem(bobShares, bob, bob);

        assertApproxEqAbs(aliceAssets, 105e6, 3);
        assertApproxEqAbs(bobAssets, 315e6, 3);
    }

    function test_ZeroRateRoundTrip() public {
        MockYieldStrategy flat = new MockYieldStrategy(IERC20(address(usdc)), 0);
        EarnVault flatVault = new EarnVault(IERC20(address(usdc)), flat, "Flat", "flUSDC");
        vm.prank(alice);
        usdc.approve(address(flatVault), type(uint256).max);
        vm.prank(alice);
        flatVault.deposit(50e6, alice);

        vm.warp(block.timestamp + YEAR);
        assertEq(flatVault.totalAssets(), 50e6);

        uint256 flatShares = flatVault.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = flatVault.redeem(flatShares, alice, alice);
        assertApproxEqAbs(assets, 50e6, 2);
    }

    function test_SetStrategyRejectsAssetMismatch() public {
        MockUSDC other = new MockUSDC();
        MockYieldStrategy wrongAsset = new MockYieldStrategy(IERC20(address(other)), RATE_X18);
        vm.expectRevert(EarnVault.StrategyAssetMismatch.selector);
        vault.setStrategy(wrongAsset);
    }

    function test_StrategySwapKeepsVaultWorking() public {
        _deposit(alice, 100e6);
        MockYieldStrategy replacement = new MockYieldStrategy(IERC20(address(usdc)), RATE_X18);
        vault.setStrategy(replacement);
        assertEq(address(vault.strategy()), address(replacement));

        vm.prank(alice);
        vault.deposit(50e6, alice);
        assertEq(replacement.principal(), 50e6);
    }
}
