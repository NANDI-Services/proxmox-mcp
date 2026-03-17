import { redact } from "./redaction.js";

const write = (level: string, message: string, context?: Record<string, unknown>): void => {
  const payload = {
    level,
    message,
    ...(context ? { context } : {}),
    time: new Date().toISOString()
  };

  process.stderr.write(`${redact(JSON.stringify(payload))}\n`);
};

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context)
};
