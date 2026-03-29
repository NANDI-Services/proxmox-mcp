import { logger } from "../logging/logger.js";

let installed = false;
let exiting = false;

const toErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "unknown";
  }
};

export const installGlobalProcessErrorHandlers = (): void => {
  if (installed) {
    return;
  }

  installed = true;

  process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled promise rejection", {
      error: toErrorMessage(reason)
    });
  });

  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught exception", {
      error: toErrorMessage(error)
    });

    if (exiting) {
      return;
    }

    exiting = true;
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  });
};

