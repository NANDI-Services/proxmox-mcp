# nandi-proxmox-mcp Marketplace Listing

## Short Description
Core+Advanced Proxmox MCP server with 140+ tools, access tiers, and secure destructive guards.

## Long Description
`nandi-proxmox-mcp` is an open source MCP server for Proxmox, powered by NANDI Services.

It enables AI assistants in VS Code/Codex/Cursor/Claude to securely perform:
- Nodes/cluster/qemu/lxc/storage/tasks/network/firewall/pools/access/template/monitoring operations
- Read-only, read-execute, and full control modes
- Controlled destructive actions via `confirm=true`
- Remote diagnostics and advanced container operations in isolated module mode

### Why this server
- 140+ metadata-driven tools with category/tier filtering
- Core+Advanced runtime split to reduce risk surface
- HTTP and stdio transports with health/readiness endpoints
- Structured guardrails (timeouts, retries, input guards, secret redaction)
- Windows-first onboarding and doctor flow

### Security Notes
- API token is user-owned and created in Proxmox (not provided by npm or MCP clients)
- Minimum ACL principle is required
- Destructive tools require explicit confirmation
- Self-signed TLS has explicit risk documentation

### Install Source
- npm package: `nandi-proxmox-mcp`
- MCP manifest: `mcp-manifest.json`

### Support
- Issues: https://github.com/NANDI-Services/proxmox-mcp/issues
- Docs: https://github.com/NANDI-Services/proxmox-mcp/tree/main/docs

### Category Suggestions
- Infrastructure
- DevOps
- MCP Servers

### Assets
- icon: `marketplace/icon.png`
- screenshot: `marketplace/screenshot-setup.png`

