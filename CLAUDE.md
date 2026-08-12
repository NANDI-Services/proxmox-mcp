# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the release runbook and the documentation sync gate. Follow it for anything release- or commit-adjacent; it is not repeated here.

## What this is

An MCP server that operates real Proxmox VE infrastructure. It is published to npm as `nandi-proxmox-mcp` for other admins to install against **their own** clusters — this repo is the tool, not one person's installation. Changes are judged by whether a stranger can install and run them.

TypeScript, ESM (`"type": "module"`), Node >= 20.

## Commands

```bash
npm ci                    # deps (lockfile-exact)
npm run lint              # eslint, type-aware
npm run typecheck         # tsc --noEmit
npm run build             # tsc -p tsconfig.build.json -> dist/
npm test                  # unit + integration. No Docker needed.
npm run test:e2e          # e2e against the Docker emulator (see Testing)
npm run validate:release  # manifest + package metadata + descriptor sync
npm run docs:tools        # regenerate docs/TOOLS.md (CI fails on drift)
```

Run a single test file or case:

```bash
npx vitest run tests/unit/retry-policy.test.ts
npx vitest run -t "does not retry a non-idempotent create"
npx vitest run -c vitest.e2e.config.ts tests/e2e/cluster-routing.e2e.test.ts
```

`npm run clean` uses cmd.exe syntax and only works on Windows.

## Architecture

### Tools are data, not handlers

All ~143 tools are descriptors in one array, `toolCatalog` in `src/tools/catalog.ts`. Almost every one is built by the `apiTool()` helper from an `EndpointDescriptor` (method + path + params); the rest are the five SSH-backed tools. `src/server/toolRegistry.ts` walks that array and registers each with the MCP SDK.

**Adding a Proxmox endpoint means adding a descriptor, not writing a function.** After any catalog change run `npm run docs:tools` — CI regenerates `docs/TOOLS.md` and fails on any diff.

### Every call goes through the guardian

`apiTool` wraps execution in `runGuarded` (`src/guardian/guardian.ts`): timeout, retry, and error mapping. Two consequences worth knowing before touching it:

- **Retry is derived from the descriptor's `idempotent` flag.** `true` gets `defaultRetryPolicy` (3 attempts); everything else gets `singleAttemptPolicy` (1). The default is `false`, so a new mutating tool is safe automatically. A client-side timeout does not prove the server rejected the request, so retrying a create can produce duplicate resources. `tests/unit/retry-policy.test.ts` pins this, including an allowlist of the only tools permitted to be both `destructive` and `idempotent` (the config-setting PUTs).
- **`mapError` walks the `error.cause` chain** (`src/guardian/errorMap.ts`) and classifies by Node error code. undici's `fetch` rejects with a bare `TypeError: fetch failed` and hangs the real reason (`ECONNREFUSED`, TLS cert codes) on `cause`. Matching only on `message` is why connectivity and TLS failures used to collapse into `UNHANDLED_ERROR`.

Relatedly, `src/proxmox/client.ts` parses the response body **after** checking the status, so an HTML error page from a reverse proxy becomes a `ProxmoxHttpError`, not `Unexpected token '<'`.

### Which tools exist depends on the environment

`PolicyEngine` (`src/server/policy.ts`) decides registration from `PVE_ACCESS_TIER` (`read-only` | `read-execute` | `full`), `PVE_MODULE_MODE` (`core` | `advanced`), plus category/tool allow- and block-lists. `loadPolicySettings()` reads `process.env` at registration time, so **tests must set those vars before calling `registerTools`**, not after.

The server default is `full`. `setup` writes the tier explicitly into the client config so the choice is visible rather than implicit.

### REST is cluster-wide; SSH is not

Proxmox's `pveproxy` forwards API requests to the owning node, so every REST tool already reaches the whole cluster from a single endpoint. `pct` does not — it is a node-local CLI, so a container on another node is unreachable by running `pct` where you connected.

`src/ssh/nodeRouter.ts` closes that gap: it resolves the guest's node through `/cluster/resources`, then reaches it either directly or by hopping through the entry node (`ssh <peer> pct exec ...`). The hop works because a Proxmox cluster shares `/etc/pve/priv/authorized_keys` across members, so one key is accepted everywhere. Which route works is discovered once and cached per node, because it depends on the operator's network rather than on Proxmox. Standalone installs take the direct path and never notice.

Only a connectivity failure (ssh exit 255) justifies trying the next route — a failure from `pct` itself means the command ran.

### One process per Proxmox

`src/config/instances.ts` models instances: each configured Proxmox gets its own credentials file and its own entry in the client config, selected at runtime by `NANDI_PROXMOX_CONFIG`. Isolation is the process boundary, deliberately — a lab instance holds no credentials for a production cluster, which no tool argument could guarantee.

`src/config/clients.ts` adapts the same server entry to each MCP client's shape (Claude Code's `.mcp.json` uses `mcpServers`, VS Code's `.vscode/mcp.json` uses `servers`). Writes **merge** into an existing file and refuse to overwrite one that does not parse.

### Transports

stdio by default; `MCP_TRANSPORT=http` switches to Streamable HTTP. The HTTP path builds a **fresh `McpServer` per POST** (`src/server/mcpServer.ts`), which matters for anything you expect to hold state across requests. The HTTP transport performs no authentication — its protections are network-level only.

## Testing

Two tiers, on purpose:

- `npm test` — unit + integration, no Docker. `vitest.config.ts` **excludes `tests/e2e/**`**. Never add a Docker-dependent test to the default run; it would make the fast CI gate require a daemon.
- `npm run test:e2e` — `vitest.e2e.config.ts`, whose `globalSetup` generates a throwaway SSH keypair, clears the stale `known_hosts` entry, and brings the emulator up and down. It needs a running Docker daemon and nothing else; no env vars to set.

`emulator/` is a fake of the Proxmox REST API over self-signed HTTPS plus a real `sshd` with a `pct` stub sharing its state through a control plane. It models a 3-node cluster with guests spread across nodes, and injects faults a healthy Proxmox never produces (401/403/500, an HTML proxy page, a non-JSON 200, a hang) — which is the only way to test the error classification. See `emulator/README.md`.

The `pct` stub refuses containers belonging to another node, exactly like the real one. That is what forces the node routing to be exercised rather than bypassed.

## Publishing boundaries

`package.json` has an explicit `files` allowlist, so `emulator/`, `tests/` and `src/` never reach the npm tarball. Verify with `npm pack --dry-run` after touching packaging.

`.gitattributes` pins `eol=lf`. The emulator's shell scripts run inside Linux containers; a CRLF checkout turns `#!/bin/sh` into `#!/bin/sh\r` and the container fails with an unhelpful `bad interpreter`.

Local wiring is gitignored and must stay that way: `.mcp.json`, `.claude/`, `.agents/`, and `docs/E2E_LIVE_REPORT.json` (written by `scripts/validate-live-tools.mjs` when validating against a real cluster — it describes that cluster).
