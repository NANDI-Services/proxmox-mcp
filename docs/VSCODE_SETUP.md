# VS Code MCP Setup

## 1. Run setup
```powershell
nandi-proxmox-mcp setup
```
This generates `.vscode/mcp.json` from template.

## 2. Option A: Add server manually (Custom server)
1. Open Codex/VS Code MCP settings.
2. Click **Agregar servidor**.
3. Use the generated `.vscode/mcp.json` entry (root `servers` format).
4. Confirm command is `npx` with args `["nandi-proxmox-mcp","run"]`.

## 3. Option B: Install from manifest
Use repository `mcp-manifest.json` as installation source (local file or hosted URL).

## 4. Validate response
Invoke `listNodes` from MCP client UI in VS Code and confirm a successful tool result.

## 5. Validate local compatibility
```powershell
nandi-proxmox-mcp doctor --check mcp-config
```

## 6. Common issues
- Wrong path to local config
- Missing `npx`
- Node not in PATH
- stale VS Code session (restart)
- config uses legacy wrapper `{ "mcp": { "servers": ... } }` instead of root `servers`
