import { logger } from "../lib/logger.js";

export interface PriceMap {
  MON: number;
  USDC: number;
  AUSD: number;
  WETH: number;
  WMON: number;
}

const FALLBACK: PriceMap = { MON: 0, USDC: 1, AUSD: 1, WETH: 0, WMON: 0 };

let cache: { at: number; prices: PriceMap } | null = null;
const TTL_MS = 60_000;

/** USD prices fetched server-side (public price APIs block browser CORS, so the backend proxies). */
export const priceService = {
  async get(): Promise<PriceMap> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;
    const prices: PriceMap = { ...FALLBACK };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const [mon, eth] = await Promise.all([
        fetch("https://api.coinpaprika.com/v1/tickers/mon-monad", { signal: ctrl.signal })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<{ quotes?: { USD?: { price?: number } } } | null>,
        fetch("https://api.coinpaprika.com/v1/tickers/eth-ethereum", { signal: ctrl.signal })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null) as Promise<{ quotes?: { USD?: { price?: number } } } | null>,
      ]);
      clearTimeout(timer);
      if (typeof mon?.quotes?.USD?.price === "number") prices.MON = mon.quotes.USD.price;
      if (typeof eth?.quotes?.USD?.price === "number") prices.WETH = eth.quotes.USD.price;
      prices.WMON = prices.MON;
    } catch (err) {
      logger.warn("prices_fetch_failed", { error: String(err) });
    }
    cache = { at: Date.now(), prices };
    return prices;
  },
};
