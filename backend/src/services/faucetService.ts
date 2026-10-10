import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config.js";
import { monadTestnet } from "../chain.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

const ERC20_TRANSFER = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const lastClaimByAddress = new Map<string, number>();
let dailySpent = 0n;
let dailyResetAt = Date.now() + 24 * 3_600_000;

/**
 * Demo faucet: sends a small amount of testnet USDC from the deployer wallet so a
 * new user (or a hackathon judge) can try the whole product in under a minute.
 * Guarded by a per-address cooldown and a rolling daily cap.
 */
export const faucetService = {
  async claimUsdc(to: string): Promise<{ txHash: string; amountRaw: string }> {
    if (!config.faucet.privateKey || !config.contracts.usdc) {
      throw new AppError("faucet is not configured", 503, "faucet_unconfigured");
    }
    const now = Date.now();
    if (now > dailyResetAt) {
      dailySpent = 0n;
      dailyResetAt = now + 24 * 3_600_000;
    }
    const key = to.toLowerCase();
    const previous = lastClaimByAddress.get(key) ?? 0;
    if (now - previous < config.faucet.cooldownMs) {
      throw new AppError("this wallet already claimed recently", 429, "faucet_cooldown");
    }
    if (dailySpent + config.faucet.amountRaw > config.faucet.dailyCapRaw) {
      throw new AppError("the faucet is empty for today", 429, "faucet_daily_cap");
    }

    const account = privateKeyToAccount(config.faucet.privateKey as `0x${string}`);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(config.chain.rpcUrl) });
    const txHash = await wallet.writeContract({
      address: config.contracts.usdc as `0x${string}`,
      abi: ERC20_TRANSFER,
      functionName: "transfer",
      args: [to as `0x${string}`, config.faucet.amountRaw],
    });

    lastClaimByAddress.set(key, now);
    dailySpent += config.faucet.amountRaw;
    logger.info("faucet_sent", { to: key, txHash, amountRaw: config.faucet.amountRaw.toString() });
    return { txHash, amountRaw: config.faucet.amountRaw.toString() };
  },
};
