#!/usr/bin/env node

import { Command } from "commander";
import { runSetup } from "./setup.js";
import { runDoctor } from "./doctor.js";
import { loadFileConfig } from "../config/fileConfig.js";
import { loadEnvConfig } from "../config/env.js";
import { startMcpServer } from "../server/mcpServer.js";

const program = new Command();

program.name("nandi-proxmox-mcp").description("Proxmox MCP server - open source, powered by NANDI Services").version("0.1.4");

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
  .action(async (options) => {
    await runSetup(options);
  });

program
  .command("doctor")
  .description("Run post-install checks")
  .option("--check <checks>", "Comma-separated checks: mcp-config,nodes,vms,cts,node-status,remote-op")
  .option("--ctid <id>", "Container ID for pct exec validation", Number)
  .action(async (options: { check?: string; ctid?: number }) => {
    await runDoctor(options);
  });

program
  .command("run")
  .description("Run MCP server (stdio by default, HTTP when MCP_TRANSPORT=http)")
  .action(async () => {
    const config = await loadFileConfig().catch(() => loadEnvConfig());
    await startMcpServer(config);
  });

void program.parseAsync(process.argv);
