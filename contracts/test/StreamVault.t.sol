// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Clean-rate harness: 1_000 base units (0.001 USDC) accrue per second.
///      Deposit = 1_000_000 base (1 USDC) => fully consumed in exactly 1000s.
contract StreamVaultTest is Test {
    MockUSDC usdc;
    StreamVault vault;
    address owner = makeAddr("owner");
    address recipient = makeAddr("recipient");

    uint96 constant RATE_X18 = 1_000e18; // 1000 base units/s, *1e18
    uint128 constant DEPOSIT = 1_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new StreamVault();
        usdc.mint(owner, 1_000_000e6);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
    }

    function test_CreatePrefundsAndStartsAtZero() public {
        uint256 id = _open();
        (uint128 whole, uint128 dust) = vault.withdrawable(id);
        assertEq(whole, 0);
        assertEq(dust, 0);
        assertEq(usdc.balanceOf(address(vault)), DEPOSIT);
    }

    function test_AccrualIsExactWholeUnits() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 500);
        (uint128 whole, uint128 dust) = vault.withdrawable(id);
        assertEq(whole, 500_000);
        assertEq(dust, 0);
    }

    function test_AccrualNeverExceedsDeposit() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 5000); // 5x the runway
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, DEPOSIT, "cap at deposit");
    }

    function test_PauseFreezesAccrualAtCallBlock() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 100);
        vm.prank(recipient);
        vault.pause(id);
        vm.warp(block.timestamp + 1000);
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, 100_000, "frozen at 100s");
    }

    function test_ResumeExcludesPausedGap() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 100);
        vm.prank(recipient);
        vault.pause(id);
        vm.warp(block.timestamp + 5000); // paused 5000s
        vm.prank(recipient);
        vault.resume(id);
        vm.warp(block.timestamp + 100);
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, 200_000, "only 200 active seconds accrue");
    }

    function test_RecipientWithdrawsPullOnlyAndKeepsNoDust() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 1000); // runway consumed
        vm.prank(recipient);
        vault.withdraw(id);
        assertEq(usdc.balanceOf(recipient), DEPOSIT);
        (uint128 whole, uint128 dust) = vault.withdrawable(id);
        assertEq(whole, 0);
        assertEq(dust, 0);
    }

    function test_OnlyRecipientCanWithdraw() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 10);
        vm.prank(owner);
        vm.expectRevert(StreamVault.NotRecipient.selector);
        vault.withdraw(id);
    }

    function test_WithdrawThenAccrueAgain() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 500);
        vm.prank(recipient);
        vault.withdraw(id);
        vm.warp(block.timestamp + 500);
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, 500_000, "remaining escrow keeps accruing");
    }

    function test_NoDoubleWithdrawPastDeposit() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 1000); // escrow fully consumed
        vm.prank(recipient);
        vault.withdraw(id);
        assertEq(usdc.balanceOf(recipient), DEPOSIT, "first withdraw takes everything");
        vm.warp(block.timestamp + 5000);
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, 0, "nothing left to accrue after full withdrawal");
        vm.prank(recipient);
        vm.expectRevert(StreamVault.NothingWithdrawable.selector);
        vault.withdraw(id);
    }

    function test_InvariantEscrowEqualsVaultBalance() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 300);
        vm.prank(recipient);
        vault.withdraw(id);
        (, , , , , , , uint128 d1, , ) = vault.streams(id);
        assertEq(usdc.balanceOf(address(vault)), d1, "deposited == vault balance after 1st withdraw");
        vm.warp(block.timestamp + 300);
        vm.prank(recipient);
        vault.withdraw(id);
        (, , , , , , , uint128 d2, , ) = vault.streams(id);
        assertEq(usdc.balanceOf(address(vault)), d2, "deposited == vault balance after 2nd withdraw");
    }

    function test_CancelSettlesAndRefundsAtomically() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 400);
        vm.prank(owner);
        vault.cancel(id);
        assertEq(usdc.balanceOf(recipient), 400_000, "accrued paid out");
        assertEq(usdc.balanceOf(owner), 1_000_000e6 - DEPOSIT + 600_000, "rest refunded");
        vm.prank(recipient);
        vm.expectRevert(StreamVault.Cancelled.selector);
        vault.withdraw(id);
    }

    function test_TopUpRestoresRoom() public {
        uint256 id = _open();
        vm.warp(block.timestamp + 1000); // exhausted
        vm.prank(owner);
        vault.topUp(id, 500_000);
        vm.warp(block.timestamp + 250);
        (uint128 whole,) = vault.withdrawable(id);
        assertEq(whole, 1_250_000, "unwithdrawn 1M accrual carries + 250k new runway");
    }

    function _open() internal returns (uint256) {
        vm.prank(owner);
        return vault.create(recipient, IERC20(address(usdc)), RATE_X18, DEPOSIT);
    }
}
