import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestAuth {
  userId: string;
  appId: string;
}

export interface RequestContext {
  requestId: string;
  startedAt: number;
  auth?: RequestAuth;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

export function setRequestAuth(auth: RequestAuth): void {
  const ctx = als.getStore();
  if (ctx) ctx.auth = auth;
}

export function requestLoggerBase(): Record<string, unknown> {
  const ctx = als.getStore();
  return ctx ? { requestId: ctx.requestId, userId: ctx.auth?.userId } : {};
}
