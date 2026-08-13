# MCP Registry manual fallback

Use this only when re-running `release.yml` is not an option — that is the first recourse now
(`gh workflow run release.yml --ref vX.Y.Z`), and it skips whatever already published. This path
is for tags cut before that workflow accepted a manual dispatch, which cannot be dispatched at all.

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
