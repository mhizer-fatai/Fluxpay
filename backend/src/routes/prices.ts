import { Router } from "express";
import { priceService } from "../services/priceService.js";

export const priceRouter = Router();

/** GET /api/v1/prices — public USD price map (backend proxies CoinGecko; browsers get CORS-blocked). */
priceRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await priceService.get());
  } catch (err) {
    next(err);
  }
});
