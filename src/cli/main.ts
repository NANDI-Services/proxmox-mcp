#!/usr/bin/env node

import { Command } from "commander";
import { runSetup } from "./setup.js";
import { runDoctor } from "./doctor.js";
import { loadFileConfig } from "../config/fileConfig.js";
import { startMcpServer } from "../server/mcpServer.js";

const program = new Command();

program.name("nandi-proxmox-mcp").description("Proxmox MCP server - open source, powered by NANDI Services").version("0.1.3");

program
  .command("setup")
  .description("Run interactive Windows-first setup")
  .action(async () => {
    await runSetup();
  });

program
  .command("doctor")
  .description("Run post-install checks")
  .option("--check <checks>", "Comma-separated checks: mcp-config,nodes,vms,cts,node-status,remote-op")
  .action(async (options: { check?: string }) => {
    await runDoctor(options.check);
  });

program
  .command("run")
  .description("Run MCP server over stdio")
  .action(async () => {
    const config = await loadFileConfig();
    await startMcpServer(config);
  });

void program.parseAsync(process.argv);
