import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { badRequest } from "../lib/errors.js";

export interface ValidateSchemas<TBody extends ZodType = ZodType, TQuery extends ZodType = ZodType> {
  body?: TBody;
  query?: TQuery;
}

/**
 * Centralized validation middleware. Parsed (and thus coerced/stripped) values replace
 * req.body and are exposed as res.locals.query for handlers.
 */
export function validate<TBody extends ZodType, TQuery extends ZodType>(
  schemas: ValidateSchemas<TBody, TQuery>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body) as typeof req.body;
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(badRequest("validation_failed", err.issues.map(i => ({ path: i.path.join("."), message: i.message }))));
        return;
      }
      next(err);
    }
  };
}
