#!/usr/bin/env node

import { Command } from "commander";
import { runSetup } from "./setup.js";
import { runDoctor } from "./doctor.js";
import { loadFileConfig } from "../config/fileConfig.js";
import { findInstances } from "../config/instances.js";
import { loadEnvConfig } from "../config/env.js";
import { logger } from "../logging/logger.js";
import { installGlobalProcessErrorHandlers } from "../runtime/processGuards.js";
import { startMcpServer } from "../server/mcpServer.js";

const program = new Command();

program.name("nandi-proxmox-mcp").description("Proxmox MCP server - open source, powered by NANDI Services").version("0.2.4");

program
  .command("setup")
  .description("Run interactive or flag-driven setup")
  .option("--proxmox-host <host>", "Proxmox host or IP")
  .option("--proxmox-port <port>", "Proxmox API port", Number)
  .option("--proxmox-user <user>", "Proxmox user without realm")
  .option("--proxmox-realm <realm>", "Proxmox realm", "pve")
  .option("--token-name <name>", "Proxmox API token name")
  .option("--token-secret <secret>", "Proxmox API token secret")
  .option("--allow-insecure-tls", "Allow self-signed TLS certificates")
  .option("--ssh-host <host>", "SSH host, defaults to Proxmox host")
  .option("--ssh-port <port>", "SSH port", Number)
  .option("--ssh-user <user>", "SSH user", "root")
  .option("--ssh-key-path <path>", "SSH private key path")
  .option("--skip-connectivity", "Write config files without testing API/SSH connectivity")
  .option("--clients <ids>", "Comma-separated client configs to write: claude-code,vscode")
  .option("--access-tier <tier>", "Tool surface to expose: read-only, read-execute, full")
  .option("--module-mode <mode>", "Module scope to expose: core, advanced")
  .option("--print-config", "Print a paste-ready MCP config to stdout and write nothing")
  .option("--name <name>", "Instance name for this Proxmox (default: discovered cluster or node name)")
  .option("--scope <scope>", "Where to store credentials: project (default) or user", "project")
  .action(async (options) => {
    await runSetup(options);
  });

program
  .command("doctor")
  .description("Run post-install checks")
  .option("--check <checks>", "Comma-separated checks: mcp-config,nodes,vms,cts,node-status,remote-op")
  .option("--ctid <id>", "Container ID for pct exec validation", Number)
  .option("--clients <ids>", "Comma-separated client configs to check: claude-code,vscode")
  .option("--name <name>", "Which configured Proxmox instance to check")
  .action(async (options: { check?: string; ctid?: number; clients?: string; name?: string }) => {
    await runDoctor(options);
  });

program
  .command("list")
  .description("List the Proxmox instances configured on this machine")
  .action(async () => {
    const instances = await findInstances(process.cwd());

    if (instances.length === 0) {
      process.stdout.write("No Proxmox instances configured yet. Run `nandi-proxmox-mcp setup`.\n");
      return;
    }

    process.stdout.write(`Configured Proxmox instances (${instances.length}):\n\n`);
    for (const instance of instances) {
      process.stdout.write(`  ${instance.name}\n`);
      process.stdout.write(`    scope:  ${instance.scope}\n`);
      process.stdout.write(`    config: ${instance.configPath}\n`);
      process.stdout.write(`    tools:  prefixed with "${instance.serverKey}"\n\n`);
    }
  });

program
  .command("run")
  .description("Run MCP server (stdio by default, HTTP when MCP_TRANSPORT=http)")
  .action(async () => {
    const config = await loadFileConfig().catch(() => loadEnvConfig());
    await startMcpServer(config);
  });

installGlobalProcessErrorHandlers();

void program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error("CLI execution failed", {
    error: error instanceof Error ? error.message : "unknown"
  });
  process.exit(1);
});
