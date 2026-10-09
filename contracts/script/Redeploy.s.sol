// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";
import {UsernameRegistry} from "../src/UsernameRegistry.sol";
import {PaymentLinkEscrow} from "../src/PaymentLinkEscrow.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {EarnVault} from "../src/EarnVault.sol";

interface IOldStrategy {
    function principal() external view returns (uint256);
    function withdraw(uint256 amount, address to) external;
}

/// @notice Redeploy the hardened contract set onto an existing network (security fix pass):
///         UsernameRegistry (commit-reveal registration), PaymentLinkEscrow (FluxPay EIP-712
///         domain), MockYieldStrategy (vault-only deposits/withdrawals) and EarnVault
///         (atomic strategy migration). Also recovers the principal from the previous,
///         unprotected strategy so no depositor funds are left behind.
/// @dev Usage:
///      PRIVATE_KEY=0x... forge script script/Redeploy.s.sol --rpc-url monad_testnet --broadcast
contract Redeploy is Script {
    address constant DEFAULT_ASSET = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant DEFAULT_OLD_STRATEGY = 0x13C118A6313260999d23437c1d11132381a37C47;
    // The Earn depositor's smart account — recovered principal returns to it.
    address constant DEFAULT_RECOVER_TO = 0xecE7fba7478e004DA6b49a8C4CCc123b1FE8b71D;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address assetAddr = vm.envOr("EARN_ASSET", DEFAULT_ASSET);
        uint256 rate = vm.envOr("YIELD_RATE_X18", uint256(0.05e18) / 31_536_000); // 5% APY, simple
        uint256 yieldSeed = vm.envOr("EARN_YIELD_SEED", uint256(0));
        address recoverTo = vm.envOr("EARN_RECOVER_TO", DEFAULT_RECOVER_TO);
        address oldStrategy = vm.envOr("OLD_EARN_STRATEGY", DEFAULT_OLD_STRATEGY);

        console2.log("Deployer:", deployer);
        console2.log("Asset:", assetAddr);

        vm.startBroadcast(pk);

        // 1. Pull the depositors' principal out of the previous strategy (it allowed
        //    anyone to call withdraw, so this works from the deployer account).
        uint256 stuck = IOldStrategy(oldStrategy).principal();
        if (stuck > 0) {
            IOldStrategy(oldStrategy).withdraw(stuck, recoverTo);
        }

        // 2. Deploy the hardened set.
        UsernameRegistry registry = new UsernameRegistry();
        PaymentLinkEscrow escrow = new PaymentLinkEscrow();
        MockYieldStrategy strategy = new MockYieldStrategy(IERC20(assetAddr), rate);
        EarnVault vault = new EarnVault(IERC20(assetAddr), strategy, "FluxPay Earn USDC", "fpUSDC");
        strategy.setVault(address(vault));

        if (yieldSeed > 0) {
            IERC20(assetAddr).approve(address(strategy), yieldSeed);
            strategy.fundYield(yieldSeed);
        }

        vm.stopBroadcast();

        console2.log("Recovered principal:", stuck);
        console2.log("UsernameRegistry:", address(registry));
        console2.log("PaymentLinkEscrow:", address(escrow));
        console2.log("MockYieldStrategy:", address(strategy));
        console2.log("EarnVault:", address(vault));
    }
}
