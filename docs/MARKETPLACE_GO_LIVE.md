# Marketplace Go-Live Checklist

This guide covers manual steps required outside this repository.

## 1. npm publication
1. Create or use npm org account.
2. Create publish token.
3. Add `NPM_TOKEN` to GitHub repository secrets.
4. Tag release (`vX.Y.Z`) and publish package.
5. Verify install:
```powershell
npx nandi-proxmox-mcp --version
```

## 2. VS Code Marketplace publication
1. Create or use VS Code Marketplace publisher.
2. Prepare package metadata: name, icon, description, categories, support URL.
3. Publish distribution artifact.
4. Verify discoverability in `Extensions: MCP Servers`.

## 3. Post-publish validation
1. Test on clean Windows machine:
   - `npx nandi-proxmox-mcp setup`
   - `nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op`
2. Verify Add Server flow in Codex/VS Code.
3. Verify manifest install flow using `mcp-manifest.json`.

## 4. Security validation
1. Create token per environment.
2. Validate minimum ACL and 403 runbook.
3. Rotate token and validate continuity.
