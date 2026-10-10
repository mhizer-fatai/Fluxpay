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
  // Contracts — public, deployed addresses for Monad testnet (see deployments/10143.json).
  // Hardcoded defaults with env overrides so a fresh deploy needs almost no config.
  contracts: {
    usdc: process.env.USDC_ADDRESS || "0x534b2f3A21130d7a60830c2Df862319e593943A3",
    weth: process.env.WETH_ADDRESS || "0x45477f4709771331db81944A5E20eF95Bc7BA2D7",
    wmon: process.env.WMON_ADDRESS || "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541",
    ausd: process.env.AUSD_ADDRESS || "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
    kusdc: process.env.KUSDC_ADDRESS || "0xa402b424f392eaa05dbc8779e4502a1f6a96fef1",
    registry: process.env.USERNAME_REGISTRY_ADDRESS || "0xAc34e4b98e7c765604551388B9EA082CD26556E2",
    fluxPay: process.env.FLUXPAY_ADDRESS || "0x3148a4deeEF4642cfA68CF2b0F35FDd62e98CF7E",
    linkEscrow: process.env.LINK_ESCROW_ADDRESS || "0x47C659745F4FFc7458314c657622557A85540434",
    streamVault: process.env.STREAM_VAULT_ADDRESS || "0x3791a605a5ED68e9e7923796Fd71ADE40E77Da13",
  },
} as const;
