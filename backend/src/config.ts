import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(req("PORT", "8080")),
  env: req("NODE_ENV", "development"),
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
  // Contracts (filled from deployments/ once deployed)
  contracts: {
    usdc: process.env.USDC_ADDRESS,
    weth: process.env.WETH_ADDRESS,
    wmon: process.env.WMON_ADDRESS,
    ausd: process.env.AUSD_ADDRESS,
    registry: process.env.USERNAME_REGISTRY_ADDRESS,
    fluxPay: process.env.FLUXPAY_ADDRESS,
    splitManager: process.env.SPLIT_MANAGER_ADDRESS,
    linkEscrow: process.env.LINK_ESCROW_ADDRESS,
    streamVault: process.env.STREAM_VAULT_ADDRESS,
  },
} as const;
