/** Typed application error mapped to an HTTP response by the central error handler. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string): AppError =>
  new AppError(`${what} not found`, 404, `${what.replace(/\s+/g, "_")}_not_found`);

export const badRequest = (code: string, details?: unknown): AppError =>
  new AppError("bad request", 400, code, details);

export const forbidden = (code: string, details?: unknown): AppError =>
  new AppError("forbidden", 403, code, details);

export const conflict = (code: string, details?: unknown): AppError =>
  new AppError("conflict", 409, code, details);
