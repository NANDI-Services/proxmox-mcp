# Release Notes - v0.1.4

## nandi-proxmox-mcp v0.1.4 is live

This release finalizes marketplace readiness under the official organization namespace.

### Highlights
- MCP Registry namespace migrated to org:
  - `io.github.NANDI-Services/nandi-proxmox-mcp`
- npm package published:
  - `nandi-proxmox-mcp@0.1.4`
- Registry entry published and verified as latest/active.
- Marketplace metadata and support links aligned to:
  - `https://github.com/NANDI-Services/proxmox-mcp`

### Install
```powershell
npx nandi-proxmox-mcp@0.1.4 --version
npx nandi-proxmox-mcp@0.1.4 setup
```

### Registry verification
```powershell
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.NANDI-Services/nandi-proxmox-mcp"
```

## Public announcement copy (short)
`nandi-proxmox-mcp v0.1.4 is live.\nNow published under the official MCP namespace io.github.NANDI-Services/nandi-proxmox-mcp, with npm + MCP Registry aligned for marketplace discovery.\nOpen source, production-ready, powered by NANDI Services.`

## Launch checklist
- [x] npm published (`0.1.4`)
- [x] MCP Registry published under org namespace
- [x] Namespace and support links updated in repo metadata
- [ ] Verify appearance in VS Code `@mcp` search (post-indexing)
- [ ] Publish Agent Plugin marketplace repo for recommended-server channel
- [ ] Create GitHub Release `v0.1.4` with changelog summary
