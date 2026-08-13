# Release and Publish Guide

## Required order

Do not publish out of order.

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm test`
5. `npm run validate:release`
6. `npm audit --include=dev --audit-level=moderate`
7. `npm ls @modelcontextprotocol/sdk undici`
8. `npm ls express`
9. `npm ls path-to-regexp`
10. `npm pack --dry-run`
11. `npm pack`
12. `npm whoami`
13. `npm publish --access public`
14. `npm view nandi-proxmox-mcp version`
15. `mcp-publisher validate .mcp/server.json`
16. `mcp-publisher publish .mcp/server.json`

If any gate fails, stop and fix it before publishing.

## npm

Manual publish:

```powershell
npm whoami
npm publish --access public
npm view nandi-proxmox-mcp version
```

If npm asks for browser/OTP auth, complete the flow at the URL it prints and rerun the publish command.

## MCP Registry

Manual fallback:

```powershell
mcp-publisher login github
mcp-publisher validate .mcp/server.json
mcp-publisher publish .mcp/server.json
```

Verify:

```powershell
node scripts/verify-registry-entry.mjs .mcp/server.json
```

## Marketplace

The marketplace listing is expected to refresh from npm + registry + source metadata.

Artifacts kept in sync by the repo:
- `package.json`
- `.mcp/server.json`
- `marketplace/mcp-registry/server.json`
- `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json`
- `marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json`

## CI/CD behavior

- `ci.yml`
  - lints the workflow files themselves, before anything else
  - validates metadata/descriptors
  - builds, tests, audits, and checks the package tarball
- `release.yml`
  - refuses any ref that is not a tag named `v<package.json version>`
  - publishes npm first
  - verifies npm version, retrying while the registry catches up
  - then publishes the MCP Registry descriptor
  - re-runnable by hand: `gh workflow run release.yml --ref vX.Y.Z`
- `mcp-publish.yml`
  - manual fallback, only once re-running `release.yml` is not an option

This removes the previous race where registry publication could run before npm had the tagged version.

## Troubleshooting

### A release published to npm but the registry or the GitHub Release never happened

- Re-run it: `gh workflow run release.yml --ref vX.Y.Z`.
- Every publishing step checks its destination before writing, so the re-run skips what already
  landed and completes what did not. This is the supported recovery; finishing it by hand is not.
- Tags cut before `release.yml` accepted a manual dispatch cannot be dispatched at all — GitHub
  reads the trigger list from the workflow file **at the ref being dispatched**, not from the
  default branch. For those, use `gh release create vX.Y.Z --generate-notes` and `mcp-publish.yml`.

### The release job refuses to start, naming the ref

- `Refusing to publish from branch '...'` — you dispatched against a branch. Dispatch against the
  tag instead.
- `Tag '...' disagrees with package.json '...'` — the tag and the version in the tree are not the
  same. Publishing past this is how `0.3.1` shipped announcing itself as `0.2.4`, so the job stops
  rather than guessing which of the two is right.

### `npm audit` fails because of a withdrawn or dev-only advisory

- Inspect the JSON output before changing dependencies.
- If the advisory is withdrawn or dev-only and the locked version is already safe, keep the dependency updated but do not remove a necessary tool just to silence the report.

### npm package verification complains about repository/source

Check:
- `package.json.repository`
- `package.json.homepage`
- `package.json.bugs`
- package tarball contents from `npm pack --dry-run`

Then run:

```powershell
npm run validate:package-metadata
```

### Registry publish fails after npm publish succeeded

Run:

```powershell
node scripts/verify-registry-entry.mjs .mcp/server.json
```

If the registry already converged, do not republish blindly.

### Marketplace listing does not refresh

Confirm all of the following first:
- `npm view nandi-proxmox-mcp version`
- `node scripts/verify-registry-entry.mjs .mcp/server.json`
- `npm run validate:package-metadata`

If all three are correct, the remaining issue is upstream propagation rather than repo state.
