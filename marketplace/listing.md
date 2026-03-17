# nandi-proxmox-mcp Marketplace Listing

## Short Description
Secure MCP server for Proxmox node, VM, and LXC operations with Windows-first onboarding.

## Long Description
`nandi-proxmox-mcp` is an open source MCP server for Proxmox, powered by NANDI Services.

It enables AI assistants in VS Code/Codex to securely perform:
- Inventory: nodes, VMs, and containers
- Status checks: node/VM/CT current state
- Power control: start/stop VM and CT
- CT remote operations: `pct exec`, `docker ps`, `docker logs`
- SSH diagnostics for batch-mode failures

### Why this server
- Production-oriented error handling with retries, timeout, and structured errors
- No hardcoded secrets
- Guided setup for Windows users
- Explicit troubleshooting for real-world incidents (403 ACL and SSH interactive vs batch)

### Security Notes
- API token is user-owned and created in Proxmox (not provided by npm or MCP clients)
- Minimum ACL principle is required
- Self-signed TLS has explicit risk documentation

### Install Source
- npm package: `nandi-proxmox-mcp`
- MCP manifest: `mcp-manifest.json`

### Support
- Issues: https://github.com/ezesc/proxmox-mcp/issues
- Docs: https://github.com/ezesc/proxmox-mcp/tree/main/docs

### Category Suggestions
- Infrastructure
- DevOps
- MCP Servers

### Assets
- icon: `marketplace/icon.png`
- screenshot: `marketplace/screenshot-setup.png`
