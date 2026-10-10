import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(req("PORT", "8080")),
  env: req("NODE_ENV", "production"),
  chain: {
    id: Number(req("CHAIN_ID", "10143")),
    rpcUrl: req("RPC_URL", "https://testnet-rpc.monad.xyz"),
  },
  db: {
    connectionString: req(
      "DATABASE_URL",
      "postgres://fluxpay:fluxpay@localhost:5432/fluxpay",
    ),
  },
  redisUrl: req("REDIS_URL", "redis://localhost:6379"),
  /** Browser origins allowed to call the API (comma-separated). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  /**
   * Demo faucet: sends a little testnet USDC from the deployer wallet so a fresh
   * user (or judge) can try the product without hunting for a faucet.
   */
  faucet: {
    privateKey: process.env.FAUCET_PRIVATE_KEY || process.env.PRIVATE_KEY || "",
    amountRaw: BigInt(process.env.FAUCET_AMOUNT_RAW || "5000000"), // 5 USDC
    dailyCapRaw: BigInt(process.env.FAUCET_DAILY_CAP_RAW || "50000000"), // 50 USDC/day
    cooldownMs: Number(process.env.FAUCET_COOLDOWN_MS || 6 * 3_600_000),
  },
  // Pimlico bundler + paymaster. Server-side only — never expose with a VITE_ prefix.
  // Optional at startup so local dev works without it; the AA proxy returns 503 when unset.
  pimlico: {
    apiKey: process.env.PIMLICO_API_KEY || "",
    baseUrl: "https://api.pimlico.io/v2",
  },
  // Contracts (filled from deployments/ once deployed)
  contracts: {
    usdc: process.env.USDC_ADDRESS,
    weth: process.env.WETH_ADDRESS,
    wmon: process.env.WMON_ADDRESS,
    ausd: process.env.AUSD_ADDRESS,
    kusdc: process.env.KUSDC_ADDRESS || "0xa402b424f392eaa05dbc8779e4502a1f6a96fef1",
    registry: process.env.USERNAME_REGISTRY_ADDRESS,
    fluxPay: process.env.FLUXPAY_ADDRESS,
    linkEscrow: process.env.LINK_ESCROW_ADDRESS,
    streamVault: process.env.STREAM_VAULT_ADDRESS,
  },
} as const;
