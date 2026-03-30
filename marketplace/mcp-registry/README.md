# MCP Registry manual fallback

Use this only when the automated `release.yml` flow cannot publish the descriptor.

## Publish

```powershell
mcp-publisher login github
mcp-publisher validate .mcp/server.json
mcp-publisher publish .mcp/server.json
```

## Verify

```powershell
node scripts/verify-registry-entry.mjs .mcp/server.json
```

Registry endpoint used by verification:

```powershell
curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.NANDI-Services/nandi-proxmox-mcp"
```

## Notes

- `.mcp/server.json` is the canonical descriptor.
- `marketplace/mcp-registry/server.json` must remain byte-for-byte aligned with it.
- `npm run validate:package-metadata` and `npm run validate:mcp-descriptors` enforce the alignment before release.
