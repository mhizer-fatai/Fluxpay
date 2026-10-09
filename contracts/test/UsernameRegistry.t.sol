// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";

contract UsernameRegistryTest is Test {
    UsernameRegistry registry;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 constant SALT = keccak256("salt");

    function setUp() public {
        registry = new UsernameRegistry();
    }

    function _hash(string memory name) internal pure returns (bytes32) {
        return keccak256(bytes(name));
    }

    function _commit(address who, string memory name) internal {
        bytes32 commitment = keccak256(abi.encode(_hash(name), SALT));
        vm.prank(who);
        registry.commit(commitment);
    }

    function _register(address who, string memory name) internal {
        _commit(who, name);
        vm.warp(block.timestamp + 1);
        vm.prank(who);
        registry.reveal(_hash(name), name, SALT);
    }

    function test_CommitRevealRegisters() public {
        _register(alice, "alice");
        assertEq(registry.ownerOf(_hash("alice")), alice);
        assertEq(registry.resolve(_hash("alice")), alice);
    }

    function test_RevealWithoutCommitReverts() public {
        vm.prank(alice);
        vm.expectRevert(UsernameRegistry.CommitmentMissing.selector);
        registry.reveal(_hash("alice"), "alice", SALT);
    }

    function test_RevealInSameSecondReverts() public {
        _commit(alice, "alice");
        vm.prank(alice);
        vm.expectRevert(UsernameRegistry.CommitmentTooFresh.selector);
        registry.reveal(_hash("alice"), "alice", SALT);
    }

    function test_RevealWrongSaltReverts() public {
        _commit(alice, "alice");
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(UsernameRegistry.Unauthorized.selector, alice));
        registry.reveal(_hash("alice"), "alice", keccak256("wrong"));
    }

    function test_RevealMismatchedNameReverts() public {
        _commit(alice, "alice");
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        // Commitment is for "alice", but the revealed string says "bob".
        vm.expectRevert(abi.encodeWithSelector(UsernameRegistry.Unauthorized.selector, alice));
        registry.reveal(_hash("alice"), "bob", SALT);
    }

    function test_CannotRegisterTakenName() public {
        _register(alice, "alice");

        _commit(bob, "alice");
        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(UsernameRegistry.AlreadyRegistered.selector, _hash("alice")));
        registry.reveal(_hash("alice"), "alice", SALT);
    }

    function test_CommitmentExpires() public {
        _commit(alice, "alice");
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vm.expectRevert(UsernameRegistry.CommitmentExpired.selector);
        registry.reveal(_hash("alice"), "alice", SALT);
    }

    function test_ReleaseFreesName() public {
        _register(alice, "alice");
        vm.prank(alice);
        registry.release(_hash("alice"));
        assertEq(registry.ownerOf(_hash("alice")), address(0));

        // Freed name can be registered by someone else.
        _register(bob, "alice");
        assertEq(registry.ownerOf(_hash("alice")), bob);
    }

    function test_ReleaseNotOwnerReverts() public {
        _register(alice, "alice");
        vm.prank(bob);
        vm.expectRevert(UsernameRegistry.NotOwner.selector);
        registry.release(_hash("alice"));
    }

    function test_TransferRejectsZeroAddress() public {
        _register(alice, "alice");
        vm.prank(alice);
        vm.expectRevert(UsernameRegistry.ZeroAddress.selector);
        registry.transfer(_hash("alice"), address(0));
    }

    function test_TransferMovesOwnership() public {
        _register(alice, "alice");
        vm.prank(alice);
        registry.transfer(_hash("alice"), bob);
        assertEq(registry.ownerOf(_hash("alice")), bob);
    }

    function test_ResolveUnknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(UsernameRegistry.NotRegistered.selector, _hash("nobody")));
        registry.resolve(_hash("nobody"));
    }
}
