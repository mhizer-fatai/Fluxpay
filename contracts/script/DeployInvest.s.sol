// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StockToken} from "../src/StockToken.sol";
import {MockEquityVenue, IPyth} from "../src/MockEquityVenue.sol";
import {InvestVault} from "../src/InvestVault.sol";

/// @notice Deploy the Pay & Invest stack: simulated stock token, Pyth-priced venue, vault.
/// @dev Usage:
///      forge script script/DeployInvest.s.sol --rpc-url monad_testnet --broadcast
///      Requires PRIVATE_KEY. Defaults target Circle USDC + Pyth NVDA/USD on Monad testnet.
contract DeployInvest is Script {
    address constant DEFAULT_ASSET = 0x534b2f3A21130d7a60830c2Df862319e593943A3; // Circle USDC (6dp)
    address constant DEFAULT_PYTH = 0x2880aB155794e7179c9eE2e38200202908C17B43; // Pyth on Monad testnet
    // Pyth NVDA/USD (US equity) — same feed id on every chain.
    bytes32 constant DEFAULT_PRICE_ID = 0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address assetAddr = vm.envOr("INVEST_ASSET", DEFAULT_ASSET);
        address pythAddr = vm.envOr("INVEST_PYTH", DEFAULT_PYTH);
        bytes32 priceId = vm.envOr("INVEST_PRICE_ID", DEFAULT_PRICE_ID);
        uint256 feeBps = vm.envOr("INVEST_FEE_BPS", uint256(25)); // 0.25%
        // Seeded from the last real Pyth NVDA value (22511000, expo -5 => $225.11).
        uint256 fallbackPriceX18 = vm.envOr("INVEST_FALLBACK_PRICE_X18", uint256(22511e16));
        uint256 maxPriceAge = vm.envOr("INVEST_MAX_PRICE_AGE", uint256(86_400)); // 24h on testnet
        string memory stockName = vm.envOr("INVEST_STOCK_NAME", string("NVIDIA xStock (simulated)"));
        string memory stockSymbol = vm.envOr("INVEST_STOCK_SYMBOL", string("NVDAx"));

        console2.log("Deployer:", deployer);
        console2.log("Asset (USDC):", assetAddr);
        console2.log("Pyth:", pythAddr);
        console2.log("Fee bps:", feeBps);
        console2.log("Fallback price X18:", fallbackPriceX18);

        vm.startBroadcast(pk);

        StockToken stock = new StockToken(stockName, stockSymbol);
        MockEquityVenue venue =
            new MockEquityVenue(IERC20(assetAddr), stock, IPyth(pythAddr), priceId, feeBps, fallbackPriceX18, maxPriceAge);
        stock.setMinter(address(venue));
        InvestVault vault = new InvestVault(IERC20(assetAddr), stock, venue);

        vm.stopBroadcast();

        console2.log("StockToken:", address(stock));
        console2.log("MockEquityVenue:", address(venue));
        console2.log("InvestVault:", address(vault));
    }
}
