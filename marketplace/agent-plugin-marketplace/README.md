# Agent Plugin Marketplace scaffold

This folder is a ready-to-copy scaffold for a custom plugin marketplace repository.

## How to use
1. Create repo: `ezesc/nandi-plugins-marketplace`.
2. Copy this folder contents to that repo root.
3. Push to GitHub.
4. In VS Code/Codex settings, add:
```json
"chat.plugins.marketplaces": ["ezesc/nandi-plugins-marketplace"]
```
5. Open `@agentPlugins` and install `NANDI Proxmox MCP`.

## Plugin payload
- `plugins/nandi-proxmox-mcp/plugin.json`
- `plugins/nandi-proxmox-mcp/.mcp.json`

## Notes
- Recommended section may still be curated by platform policy.
- Custom marketplace path is immediate and fully controlled by you.
