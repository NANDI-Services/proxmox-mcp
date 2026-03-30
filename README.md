# nandi-proxmox-mcp

Open source MCP server for Proxmox VE, powered by NANDI Services.

`nandi-proxmox-mcp` exposes Proxmox inventory, lifecycle, storage, backup, networking, firewall, access, monitoring, SSH diagnostics, and guarded remote/container operations without removing the safety rails needed for production clusters.

## What stays enabled

- 140+ tools across nodes, cluster, QEMU, LXC, storage, backup, tasks, network, firewall, pools, access, templates, monitoring, and remote operations.
- Access tiers: `read-only`, `read-execute`, `full`.
- Module split: `PVE_MODULE_MODE=core|advanced`.
- Tool filters: `PVE_CATEGORIES`, `PVE_TOOL_BLACKLIST`, `PVE_TOOL_WHITELIST`.
- Destructive guardrails via `confirm=true`.
- Backward-compatible aliases such as `listNodes`, `getVMStatus`, `startVM`, `stopContainer`.
- `stdio` transport for MCP clients and Streamable HTTP transport for controlled remote deployments.

## Required permissions

The server needs two trust channels and both are preserved intentionally:

- Proxmox API token
  - Used for inventory, lifecycle, configuration, and management endpoints.
  - Keep ACLs minimal: only grant the roles needed for the tools you actually enable.
- SSH batch access to the Proxmox host
  - Required for `pct exec`, batch SSH diagnostics, and container-level Docker inspection tools.
  - This is still necessary because Proxmox API coverage does not replace host-side `pct` and SSH-based diagnostics.

More detail: [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

## Destructive confirmations

Operations marked destructive do not execute unless the caller sends `confirm=true`.

Examples:
- VM/container stop, shutdown, reboot, suspend, delete, migrate, snapshot rollback
- storage/network/firewall/access writes that can alter cluster state
- advanced remote execution such as `pve_exec_in_container`

The server returns a structured `CONFIRMATION_REQUIRED` error when confirmation is missing. This behavior is unchanged and reinforced.

## Access tiers

- `read-only`
  - Inventory, status, logs, metrics, and non-mutating diagnostics.
- `read-execute`
  - Read-only plus selected execution/lifecycle actions.
- `full`
  - Create, update, delete, migrate, restore, and admin-level operations.

`PVE_MODULE_MODE=core` hides advanced tools without renaming or removing canonical tool IDs from the codebase.

## Runtime configuration

### Environment variables

Required:
- `PROXMOX_HOST`
- `PROXMOX_USER`
- `PROXMOX_REALM`
- `PROXMOX_TOKEN_NAME`
- `PROXMOX_TOKEN_SECRET`
- `PROXMOX_SSH_HOST`
- `PROXMOX_SSH_USER`
- `PROXMOX_SSH_KEY_PATH`

Optional:
- `PROXMOX_PORT` default `8006`
- `PROXMOX_SSH_PORT` default `22`
- `PROXMOX_ALLOW_INSECURE_TLS` default `false`
- `PVE_ACCESS_TIER=read-only|read-execute|full`
- `PVE_MODULE_MODE=core|advanced`
- `PVE_CATEGORIES`
- `PVE_TOOL_BLACKLIST`
- `PVE_TOOL_WHITELIST`

HTTP transport:
- `MCP_TRANSPORT=stdio|http`
- `MCP_HOST` default `0.0.0.0`
- `MCP_PORT` default `3000`
- `MCP_ALLOWED_HOSTS`
- `MCP_ALLOWED_ORIGINS`
- `MCP_RATE_LIMIT_WINDOW_MS`
- `MCP_RATE_LIMIT_MAX`
- `MCP_MAX_BODY_SIZE_BYTES`
- `MCP_HEADERS_TIMEOUT_MS`
- `MCP_REQUEST_TIMEOUT_MS`
- `MCP_KEEPALIVE_TIMEOUT_MS`
- `MCP_MAX_HEADERS_COUNT`

### Local config file

Setup writes `.nandi-proxmox-mcp/config.json` and `.vscode/mcp.json`.

The config loader now rejects:
- empty or malformed config paths
- oversized config files
- control characters in config paths

## Quick start

Guided setup:

```powershell
npx nandi-proxmox-mcp setup
npx nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

Direct run with environment variables:

```powershell
$env:PROXMOX_HOST="pve.local"
$env:PROXMOX_PORT="8006"
$env:PROXMOX_USER="svc_mcp"
$env:PROXMOX_REALM="pve"
$env:PROXMOX_TOKEN_NAME="nandi-mcp"
$env:PROXMOX_TOKEN_SECRET="<SECRET>"
$env:PROXMOX_SSH_HOST="pve.local"
$env:PROXMOX_SSH_USER="root"
$env:PROXMOX_SSH_KEY_PATH="$env:USERPROFILE\.ssh\id_ed25519"

npx nandi-proxmox-mcp run
```

## Security Model & Residual Risk

This MCP server operates real Proxmox infrastructure and is not a sandboxed environment.

### Trust Assumptions
- The server is deployed in a trusted environment
- Only authorized operators can access it
- Network exposure is controlled (not publicly exposed)
- Credentials are securely managed

### Residual Risks
The following risks are inherent to the system design:

- **Privileged Operations**  
  Full access tier and container execution capabilities can perform destructive or system-level actions.

- **SSH Execution Boundary**  
  Remote command execution relies on SSH and inherits the security posture of the target system.

- **Optional Insecure TLS Mode**  
  When enabled (`PROXMOX_ALLOW_INSECURE_TLS=true`), TLS certificate validation is bypassed and may expose connections to MITM attacks. Intended for lab use only.

- **External Dependency Synchronization**  
  Package distribution and listing visibility depend on npm, MCP Registry, and marketplace propagation timing.

### Security Responsibilities
Users are responsible for:
- Restricting access to trusted operators only
- Using least-privilege API tokens and SSH keys
- Avoiding insecure TLS in production environments
- Properly securing the underlying infrastructure

### Safety Controls Implemented
- Access tiers (read-only, read-execute, full)
- Confirmation required for destructive operations
- Input validation and command hardening
- Rate limiting and request validation

## HTTP hardening

When `MCP_TRANSPORT=http` is enabled, the server now applies:

- host allowlist enforcement, including wildcard-bind protection
- origin validation for requests that send an `Origin` header
- explicit body-size limits and sanitized `413` responses
- rate limiting on `/mcp`
- request/header/keep-alive timeouts
- `X-Content-Type-Options: nosniff`
- `Cache-Control: no-store`
- sanitized error payloads without stack traces

Health/readiness endpoints:
- `GET /health`
- `GET /ready`
- `POST /mcp`

## SSH and command-execution hardening

Functionality is unchanged, but the execution path is stricter:

- local command execution still uses `spawn(..., { shell: false })`
- SSH host/user values cannot smuggle CLI options
- SSH uses `BatchMode`, `IdentitiesOnly`, public-key auth, and explicit connection liveness controls
- output buffers are capped to prevent unbounded memory growth
- `dockerLogsInContainer` now validates and shell-escapes container names instead of interpolating raw user input
- arbitrary container command execution remains available only through the already-destructive `pve_exec_in_container` flow with confirmation required

## Security posture

Mitigations in the repo:
- pinned direct dependency versions and npm `overrides` for critical transitive packages
- verifiable package metadata and repository links for npm/package scanners
- descriptor/version sync validation for npm, registry, and marketplace artifacts
- redaction of token/header/password-like values in logs
- no stack traces or secrets returned to clients
- CI gates for lint, typecheck, build, tests, metadata validation, descriptor sync, `npm pack --dry-run`, and audit

Threat model and residual risks: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)

## Publish flow

Release order is strict:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test`
5. `npm audit --include=dev --audit-level=moderate`
6. `npm ls express`
7. `npm ls path-to-regexp`
8. `npm pack --dry-run`
9. `npm pack`
10. `npm whoami`
11. `npm publish --access public`
12. `npm view nandi-proxmox-mcp version`
13. `mcp-publisher validate .mcp/server.json`
14. `mcp-publisher publish .mcp/server.json`

The tag-based `release.yml` now publishes npm first and only then publishes the MCP Registry descriptor, preventing npm/registry drift on the same version.

Manual fallback and troubleshooting: [docs/RELEASE.md](docs/RELEASE.md)

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run validate:release
npm pack --dry-run
```

## Documentation Maintenance Policy

This repository enforces a pre-commit documentation sync gate.

- Before closing a `change`, `fix`, or `refactor`, evaluate whether `README.md`, `AGENTS.md`, and `CONTRIBUTING.md` must be updated.
- If a document is relevant to the behavioral or process impact, it must be updated in the same change set.
- If no update is needed, an explicit `no-doc-change` justification is required.
- A task is not considered ready-to-commit until this gate is satisfied.

## Docs

- [docs/QUICKSTART.md](docs/QUICKSTART.md)
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)
- [docs/RELEASE.md](docs/RELEASE.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/TOOLS.md](docs/TOOLS.md)
- [docs/MARKETPLACE_GO_LIVE.md](docs/MARKETPLACE_GO_LIVE.md)

## Registry and marketplace

- npm: `https://www.npmjs.com/package/nandi-proxmox-mcp`
- MCP Registry: `https://registry.modelcontextprotocol.io/`
- MCP Marketplace listing: `https://mcp-marketplace.io/server/io-github-nandi-services-nandi-proxmox-mcp`

## License

MIT. See [LICENSE](LICENSE).
