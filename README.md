# nandi-proxmox-mcp

Open source MCP Server for Proxmox, powered by NANDI Services.

`nandi-proxmox-mcp` is now a **Core + Advanced** MCP platform with declarative tool metadata, security tiers, destructive confirmation flow, and dual transport (`stdio` + Streamable HTTP).

## Highlights
- 120+ Proxmox tools (descriptor-driven catalog).
- Access tiers: `read-only`, `read-execute`, `full`.
- Filters: `PVE_CATEGORIES`, `PVE_TOOL_BLACKLIST`, `PVE_TOOL_WHITELIST`.
- Destructive guardrails: `confirm=true` enforcement.
- Runtime split: `PVE_MODULE_MODE=core|advanced`.
- Transport: `MCP_TRANSPORT=stdio|http` with `/health` and `/ready`.
- Backward compatibility for legacy tool names (`listNodes`, `listVMs`, `listContainers`, etc.) via aliases.

## Quickstart (npx)
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

Or guided setup:
```powershell
npx nandi-proxmox-mcp setup
npx nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

## Quickstart (Docker)
`Dockerfile` supports both transports.

stdio mode:
```bash
docker build -t nandi-proxmox-mcp .
docker run --rm -i \
  -e PROXMOX_HOST=pve.local \
  -e PROXMOX_USER=svc_mcp \
  -e PROXMOX_REALM=pve \
  -e PROXMOX_TOKEN_NAME=nandi-mcp \
  -e PROXMOX_TOKEN_SECRET=xxxxx \
  -e PROXMOX_SSH_HOST=pve.local \
  -e PROXMOX_SSH_USER=root \
  -e PROXMOX_SSH_KEY_PATH=/keys/id_ed25519 \
  nandi-proxmox-mcp
```

HTTP mode:
```bash
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=http \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=3000 \
  -e PROXMOX_HOST=pve.local \
  -e PROXMOX_USER=svc_mcp \
  -e PROXMOX_REALM=pve \
  -e PROXMOX_TOKEN_NAME=nandi-mcp \
  -e PROXMOX_TOKEN_SECRET=xxxxx \
  -e PROXMOX_SSH_HOST=pve.local \
  -e PROXMOX_SSH_USER=root \
  -e PROXMOX_SSH_KEY_PATH=/keys/id_ed25519 \
  nandi-proxmox-mcp
```

Health/readiness:
- `GET /health`
- `GET /ready`
- MCP endpoint: `POST /mcp`

## Environment Variables
Connection:
- `PROXMOX_HOST` (required)
- `PROXMOX_PORT` (default: `8006`)
- `PROXMOX_USER` (required)
- `PROXMOX_REALM` (default: `pve`)
- `PROXMOX_TOKEN_NAME` (required)
- `PROXMOX_TOKEN_SECRET` (required)
- `PROXMOX_ALLOW_INSECURE_TLS` (`false` by default)
- `PROXMOX_SSH_HOST`, `PROXMOX_SSH_PORT`, `PROXMOX_SSH_USER`, `PROXMOX_SSH_KEY_PATH`

Security/capabilities:
- `PVE_ACCESS_TIER=read-only|read-execute|full` (default: `full`)
- `PVE_MODULE_MODE=core|advanced` (default: `core`)
- `PVE_CATEGORIES=nodes,qemu,lxc,...`
- `PVE_TOOL_BLACKLIST=tool_a,tool_b`
- `PVE_TOOL_WHITELIST=tool_x,tool_y`

Transport:
- `MCP_TRANSPORT=stdio|http` (default: `stdio`)
- `MCP_HOST` (default: `0.0.0.0`)
- `MCP_PORT` (default: `3000`)

## Access Tiers
- `read-only`: read/list/status/log tools.
- `read-execute`: includes lifecycle/task execution and selected operations.
- `full`: includes create/update/delete/migrate/restore/admin operations.

Operations marked as destructive and `confirmRequired` return a guardrail response unless `confirm=true` is provided.

## Tool Catalog
The complete catalog is generated from metadata:
- [docs/TOOLS.md](docs/TOOLS.md)

Regenerate after catalog changes:
```bash
npm run build
npm run docs:tools
```

## VS Code / Codex / Cursor / Claude
### VS Code / Codex
Use generated `.vscode/mcp.json` via setup, or `mcp-manifest.json`.

### Claude / Cursor (stdio)
```json
{
  "mcpServers": {
    "nandi-proxmox-mcp": {
      "command": "npx",
      "args": ["nandi-proxmox-mcp", "run"],
      "env": {
        "NANDI_PROXMOX_CONFIG": "/path/to/.nandi-proxmox-mcp/config.json"
      }
    }
  }
}
```

### Claude / Cursor (remote HTTP)
```json
{
  "mcpServers": {
    "nandi-proxmox-mcp": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Security Principles
- No secrets committed in templates or tracked config.
- Redaction of token/header/password-like fields in logs.
- Policy engine for tier/category/whitelist/blacklist enforcement.
- Confirm-required guardrails for destructive operations.
- CI includes lint, typecheck, tests, manifest validation, gitleaks, and `npm audit`.

## Development
```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:tools
```

## Docs
- [Quickstart](docs/QUICKSTART.md)
- [Security Guide](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Tool Catalog](docs/TOOLS.md)
- [Migration 0.2.x](docs/MIGRATION_0_2.md)

## License
MIT. See LICENSE.
