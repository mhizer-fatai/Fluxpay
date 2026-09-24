import { requestLoggerBase } from "../context/requestContext.js";

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...requestLoggerBase(),
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
