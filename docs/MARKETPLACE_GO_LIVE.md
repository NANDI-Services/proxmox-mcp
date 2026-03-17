# Marketplace Go-Live Checklist

This guide covers manual publication steps for discovery channels that are separate from npm.

## Prerequisites
1. npm package already published (`nandi-proxmox-mcp@0.1.2` or later).
2. `mcp-manifest.json` validated (`npm run validate:manifest`).
3. Listing assets prepared under `marketplace/`.

## Channel 1: MCP marketplace (`@mcp` in VS Code)
1. Create or use the publisher/account required by the MCP registry/marketplace.
2. Submit server entry with:
   - npm package: `nandi-proxmox-mcp`
   - manifest: `mcp-manifest.json`
   - registry descriptor: `marketplace/mcp-registry/server.json`
   - listing text: `marketplace/listing.md`
   - security notes: `marketplace/security.md`
   - assets: `marketplace/icon.png`, `marketplace/screenshot-setup.png`
3. Complete trust/security review requested by the marketplace.
4. Wait for indexing and verify discoverability in `Extensions: MCP Servers` with `@mcp`.

## Channel 2: Codex/VS Code recommended servers
1. Create an Agent Plugin package that references this MCP server/manifest.
   - Scaffold already prepared in `marketplace/agent-plugin-marketplace/`.
2. Publish that plugin in the plugin marketplace configured by Codex/VS Code.
3. Complete plugin metadata:
   - name, icon, support URL, privacy/security statement
   - install/run instructions
4. Note that “recommended” visibility can be curated and may not be immediate.

## Ready-to-use files generated in this repo
- MCP Registry:
  - `marketplace/mcp-registry/server.json`
  - `marketplace/mcp-registry/README.md`
- Agent plugin marketplace scaffold:
  - `marketplace/agent-plugin-marketplace/.github/plugin/marketplace.json`
  - `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json`
  - `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json`

## Post-publish validation
1. On a clean Windows machine:
   - `npx nandi-proxmox-mcp@0.1.2 --version`
   - `npx nandi-proxmox-mcp@0.1.2 setup`
   - `npx nandi-proxmox-mcp@0.1.2 doctor --check mcp-config,nodes,vms,cts,node-status,remote-op`
2. Verify MCP marketplace install writes valid `mcp.json` (`servers` at root).
3. Verify Codex Settings install works without manual JSON copy.

## Security validation before public listing
1. Ensure no secrets in repository history or listing material.
2. Reconfirm ACL minimum-privilege guidance in docs.
3. Reconfirm 403 and SSH batch runbooks are linked in marketplace copy.
4. Test token rotation flow end-to-end once before launch.
