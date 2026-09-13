// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {FluxPay} from "../src/FluxPay.sol";
import {SplitManager} from "../src/SplitManager.sol";
import {PaymentLinkEscrow} from "../src/PaymentLinkEscrow.sol";
import {StreamVault} from "../src/StreamVault.sol";

/// @notice Broadcast deploy of the Fluxpay contract set.
/// @dev Usage:
///      forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --verify
///      Requires PRIVATE_KEY env var. CREATE2 addresses are recorded in /deployments
///      (deterministic factory deployment is a follow-up before "real" addresses are used).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        UsernameRegistry registry = new UsernameRegistry();
        FluxPay pay = new FluxPay();
        SplitManager splits = new SplitManager();
        PaymentLinkEscrow links = new PaymentLinkEscrow();
        StreamVault streams = new StreamVault();

        vm.stopBroadcast();

        console2.log("MockUSDC:", address(usdc));
        console2.log("UsernameRegistry:", address(registry));
        console2.log("FluxPay:", address(pay));
        console2.log("SplitManager:", address(splits));
        console2.log("PaymentLinkEscrow:", address(links));
        console2.log("StreamVault:", address(streams));
    }
}
