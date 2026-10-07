// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20, IERC20} from "openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StreamVault
/// @notice Per-second billing vaults (SYSTEM_DESIGN.md §4.1).
/// @dev Accrual is derived, never per-tx: accrued = active_seconds * ratePerSecondX18.
///      Folding into `unclaimedX18` happens only on state changes (pause/resume/topUp/
///      withdraw/cancel). Internal 18-decimal scaling preserves remainder so low-rate
///      streams (e.g. $1/mo USDC) never lose dust. Prefunded per-stream escrow -> can
///      never be insolvent; accrual auto-caps at the deposit (StreamExhausted).
contract StreamVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stream {
        address owner; // payer
        address recipient;
        IERC20 token;
        uint96 ratePerSecondX18; // token base units per second, *1e18
        uint64 createdAt;
        uint64 pausedAt; // 0 == running
        uint64 lastFoldTs; // accrual folded through this timestamp
        uint128 deposited; // remaining prefunded escrow, whole base units (== vault balance)
        uint256 unclaimedX18; // accrued but unpaid, *1e18 (holds dust)
        bool cancelled;
    }

    event StreamOpened(
        uint256 indexed id, address indexed owner, address indexed recipient, address token, uint96 ratePerSecondX18
    );
    event StreamTopUp(uint256 indexed id, uint256 amount);
    event StreamPaused(uint256 indexed id);
    event StreamResumed(uint256 indexed id);
    event StreamWithdrawn(uint256 indexed id, address indexed recipient, uint256 amount);
    event StreamCancelled(uint256 indexed id, uint256 paidOut, uint256 refunded);
    event StreamExhausted(uint256 indexed id);

    error ZeroAddress();
    error ZeroRate();
    error ZeroDeposit();
    error NotOwner();
    error NotRecipient();
    error NotOwnerOrRecipient();
    error Cancelled();
    error Paused();
    error Running();
    error NothingWithdrawable();
    error StreamNotFound();

    uint256 public nextStreamId;
    mapping(uint256 => Stream) public streams;

    /// @notice Open a prefunded stream. msg.sender is the payer/owner.
    /// @param recipient Who accrues value every second.
    /// @param token Settlement asset (USDC).
    /// @param ratePerSecondX18 Base units per second, *1e18.
    ///        e.g. $5/mo USDC = (5e6 * 1e18) / 2_592_000.
    /// @param initialDeposit Whole base units prefunded (the accrual cap).
    function create(address recipient, IERC20 token, uint96 ratePerSecondX18, uint128 initialDeposit)
        external
        returns (uint256 id)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (ratePerSecondX18 == 0) revert ZeroRate();
        if (initialDeposit == 0) revert ZeroDeposit();

        id = nextStreamId++;
        uint64 nowTs = uint64(block.timestamp);
        streams[id] = Stream({
            owner: msg.sender,
            recipient: recipient,
            token: token,
            ratePerSecondX18: ratePerSecondX18,
            createdAt: nowTs,
            pausedAt: 0,
            lastFoldTs: nowTs,
            deposited: initialDeposit,
            unclaimedX18: 0,
            cancelled: false
        });
        token.safeTransferFrom(msg.sender, address(this), initialDeposit);
        emit StreamOpened(id, msg.sender, recipient, address(token), ratePerSecondX18);
    }

    /// @notice Whole withdrawable base units + carried dust (X18), for live tick display.
    function withdrawable(uint256 id) external view returns (uint128 wholeUnits, uint128 dustX18) {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (s.cancelled) return (0, 0);
        uint256 projected = _projectedX18(s, uint64(block.timestamp));
        return (uint128(projected / 1e18), uint128(projected % 1e18));
    }

    /// @notice Recipient pulls everything accrued to now (pull-only — no counterparty tx
    ///         required). Dust stays in `unclaimedX18`, never lost. `deposited` escrow is
    ///         consumed proportionally so funds can never be withdrawn more than once.
    function withdraw(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (msg.sender != s.recipient) revert NotRecipient();
        if (s.cancelled) revert Cancelled();

        _fold(s, id, uint64(block.timestamp));
        uint256 whole = s.unclaimedX18 / 1e18;
        if (whole == 0) revert NothingWithdrawable();
        s.unclaimedX18 -= whole * 1e18;
        s.deposited -= uint128(whole);
        s.token.safeTransfer(s.recipient, whole);
        emit StreamWithdrawn(id, s.recipient, whole);
    }

    /// @notice Freeze accrual at this block. Demo moment: tick freezes in <1s.
    function pause(uint256 id) external {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (msg.sender != s.owner && msg.sender != s.recipient) revert NotOwnerOrRecipient();
        if (s.cancelled) revert Cancelled();
        if (s.pausedAt != 0) revert Paused();
        _fold(s, id, uint64(block.timestamp));
        s.pausedAt = uint64(block.timestamp);
        emit StreamPaused(id);
    }

    /// @notice Resume a paused stream. Paused time is excluded from accrual.
    function resume(uint256 id) external {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (msg.sender != s.owner && msg.sender != s.recipient) revert NotOwnerOrRecipient();
        if (s.cancelled) revert Cancelled();
        if (s.pausedAt == 0) revert Running();
        s.pausedAt = 0;
        s.lastFoldTs = uint64(block.timestamp); // skip the paused gap
        emit StreamResumed(id);
    }

    /// @notice Owner tops up the prefunded escrow (re-opens room above the old cap).
    function topUp(uint256 id, uint128 amount) external nonReentrant {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (msg.sender != s.owner) revert NotOwner();
        if (s.cancelled) revert Cancelled();
        if (amount == 0) revert ZeroDeposit();
        _fold(s, id, uint64(block.timestamp));
        s.deposited += amount;
        s.token.safeTransferFrom(msg.sender, address(this), amount);
        emit StreamTopUp(id, amount);
    }

    /// @notice Owner or recipient ends the stream atomically: accrued-to-now pays out
    ///         (rounded up to whole units), the remainder refunds to the owner.
    function cancel(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (s.recipient == address(0)) revert StreamNotFound();
        if (msg.sender != s.owner && msg.sender != s.recipient) revert NotOwnerOrRecipient();
        if (s.cancelled) revert Cancelled();

        _fold(s, id, uint64(block.timestamp));
        uint256 owed = s.unclaimedX18;
        uint256 wholePaid = owed == 0 ? 0 : (owed + 1e18 - 1) / 1e18; // ceil to whole units
        if (wholePaid > s.deposited) wholePaid = s.deposited;
        uint256 refunded = uint256(s.deposited) - wholePaid;

        s.cancelled = true;
        s.unclaimedX18 = 0;
        s.deposited = 0; // all escrow leaves the vault
        if (wholePaid > 0) s.token.safeTransfer(s.recipient, wholePaid);
        if (refunded > 0) s.token.safeTransfer(s.owner, refunded);
        emit StreamCancelled(id, wholePaid, refunded);
    }

    // ------------------------------------------------------------------ internal

    /// @dev Projected accrued X18 at `nowTs` without state change (running only adds time).
    function _projectedX18(Stream storage s, uint64 nowTs) internal view returns (uint256) {
        uint256 accrued = s.unclaimedX18;
        if (s.pausedAt == 0 && !s.cancelled && nowTs > s.lastFoldTs) {
            accrued += uint256(nowTs - s.lastFoldTs) * uint256(s.ratePerSecondX18);
        }
        uint256 cap = uint256(s.deposited) * 1e18;
        return accrued > cap ? cap : accrued;
    }

    /// @dev Fold elapsed running seconds into `unclaimedX18` and advance `lastFoldTs`.
    ///      Capped at the deposit; emits StreamExhausted the first time the cap is hit.
    function _fold(Stream storage s, uint256 id, uint64 nowTs) internal {
        if (s.pausedAt != 0 || s.cancelled) return;
        if (nowTs <= s.lastFoldTs) return;
        uint256 cap = uint256(s.deposited) * 1e18;
        uint256 before = s.unclaimedX18;
        uint256 accruedAfter = before + uint256(nowTs - s.lastFoldTs) * uint256(s.ratePerSecondX18);
        if (accruedAfter > cap) {
            accruedAfter = cap;
            if (before < cap) emit StreamExhausted(id);
        }
        s.unclaimedX18 = accruedAfter;
        s.lastFoldTs = nowTs;
    }
}
