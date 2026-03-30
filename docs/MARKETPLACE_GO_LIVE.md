# Marketplace Go-Live Checklist

## Before publishing

1. `npm run validate:release`
2. `npm audit --include=dev --audit-level=moderate`
3. `npm pack --dry-run`
4. `npm pack`
5. `npm whoami`
6. `npm publish --access public`
7. `npm view nandi-proxmox-mcp version`

## MCP Registry

Publish from the repo descriptor:

```powershell
mcp-publisher login github
mcp-publisher validate .mcp/server.json
mcp-publisher publish .mcp/server.json
node scripts/verify-registry-entry.mjs .mcp/server.json
```

Primary files:
- `.mcp/server.json`
- `marketplace/mcp-registry/server.json`
- `marketplace/listing.md`
- `marketplace/security.md`

## Marketplace / plugin artifacts

Keep these aligned with the released npm version:
- `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json`
- `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json`

The repo now validates this automatically with:

```powershell
npm run validate:package-metadata
```

## Post-publish checks

On a clean machine:

```powershell
npx nandi-proxmox-mcp@0.2.4 --version
npx nandi-proxmox-mcp@0.2.4 setup
npx nandi-proxmox-mcp@0.2.4 doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

Then confirm:
- npm package resolves correctly
- registry descriptor is active/latest
- marketplace/plugin metadata points to the same version and repository

## Security review items

- No secrets in repo, package tarball, docs, or listing assets
- README and `docs/SECURITY.md` describe required permissions and residual risks clearly
- destructive confirmation behavior remains documented
- SSH remains justified and documented rather than hidden
