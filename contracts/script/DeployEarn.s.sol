// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockYieldStrategy} from "../src/MockYieldStrategy.sol";
import {EarnVault} from "../src/EarnVault.sol";

/// @notice Deploy the Earn stack (vault + testnet yield strategy) against an existing asset.
/// @dev Usage:
///      EARN_ASSET=0x... YIELD_RATE_X18=... EARN_YIELD_SEED=5000000 \
///        forge script script/DeployEarn.s.sol --rpc-url monad_testnet --broadcast
///      Requires PRIVATE_KEY. EARN_ASSET defaults to the app's testnet USDC.
///      EARN_YIELD_SEED (asset units) is optional; it pre-funds the yield reserve so
///      deposits start earning immediately.
contract DeployEarn is Script {
    address constant DEFAULT_ASSET = 0x534b2f3A21130d7a60830c2Df862319e593943A3;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address assetAddr = vm.envOr("EARN_ASSET", DEFAULT_ASSET);
        uint256 rate = vm.envOr("YIELD_RATE_X18", uint256(0.05e18) / 31_536_000); // 5% APY, simple
        uint256 yieldSeed = vm.envOr("EARN_YIELD_SEED", uint256(0));

        console2.log("Deployer:", deployer);
        console2.log("Asset:", assetAddr);
        console2.log("Yield rate per second (x18):", rate);
        console2.log("Yield seed:", yieldSeed);

        vm.startBroadcast(pk);

        MockYieldStrategy strategy = new MockYieldStrategy(IERC20(assetAddr), rate);
        EarnVault vault = new EarnVault(IERC20(assetAddr), strategy, "FluxPay Earn USDC", "fpUSDC");

        if (yieldSeed > 0) {
            IERC20(assetAddr).approve(address(strategy), yieldSeed);
            strategy.fundYield(yieldSeed);
        }

        vm.stopBroadcast();

        console2.log("MockYieldStrategy:", address(strategy));
        console2.log("EarnVault:", address(vault));
    }
}
