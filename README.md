# nandi-proxmox-mcp

Open source MCP Server for Proxmox, powered by NANDI Services.

`nandi-proxmox-mcp` lets users connect to their own Proxmox server and operate nodes, VMs, and CT/LXC securely via MCP tools in VS Code.

## Important: API token ownership
The Proxmox API token is **not** delivered by npm, VS Code, or this MCP package.
Each user must create a token in their own Proxmox environment with minimum ACL permissions.

## 5-minute Quickstart (Windows)
1. Install Node.js 20+.
2. Run `npm install -g nandi-proxmox-mcp`.
3. Run `nandi-proxmox-mcp setup` and complete guided onboarding.
4. Run `nandi-proxmox-mcp doctor --check nodes,vms,cts,node-status,remote-op`.
5. Open VS Code and confirm MCP server is registered (`.vscode/mcp.json`).

Alternative direct run:
- `npx nandi-proxmox-mcp setup`
- `npx nandi-proxmox-mcp run`

## MCP tools included
- Inventory: `listNodes`, `listVMs`, `listContainers`
- Status: `getNodeStatus`, `getVMStatus`, `getContainerStatus`
- Control: `startVM`, `stopVM`, `startContainer`, `stopContainer`
- CT operations: `execInContainer`, `dockerPsInContainer`, `dockerLogsInContainer`, `runRemoteDiagnostic`, `sshBatchDiagnostics`

## Security principles
- No hardcoded host/token secrets in versioned files.
- Local sensitive config generated in `.nandi-proxmox-mcp/config.json`.
- Templates with placeholders only.
- CI includes secret scanning and dependency scanning.

## Docs
- [Quickstart](docs/QUICKSTART.md)
- [Windows Installation](docs/INSTALL_WINDOWS.md)
- [Proxmox Token + ACL Setup](docs/PROXMOX_SETUP.md)
- [SSH Setup and Batch Validation](docs/SSH_SETUP.md)
- [VS Code MCP Setup](docs/VSCODE_SETUP.md)
- [Security Guide](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [FAQ](docs/FAQ.md)
- [CI Secrets Policy](docs/CI_SECRETS.md)

## Development
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

## License
MIT. See LICENSE.
