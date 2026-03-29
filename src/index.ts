import { loadEnvConfig } from "./config/env.js";
import { loadFileConfig } from "./config/fileConfig.js";
import { logger } from "./logging/logger.js";
import { startMcpServer } from "./server/mcpServer.js";
import type { RuntimeConfig } from "./config/validate.js";

const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  try {
    return await loadFileConfig();
  } catch {
    return loadEnvConfig();
  }
};

const main = async (): Promise<void> => {
  const config = await loadRuntimeConfig();
  const running = await startMcpServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("Shutdown signal received", { signal });
    await running.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  logger.info("nandi-proxmox-mcp started", { transport: running.mode });
};

void main().catch((error: unknown) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : "unknown"
  });
  process.exit(1);
});
