# VS Code MCP Setup

## 1. Run setup
```powershell
nandi-proxmox-mcp setup
```
This generates `.vscode/mcp.json` from template.

## 2. Verify server registration
Open your MCP settings in VS Code and confirm `nandi-proxmox-mcp` is present.

## 3. Validate response
Invoke `listNodes` from MCP client UI in VS Code and confirm a successful tool result.

## 4. Common issues
- Wrong path to local config
- Missing `npx`
- Node not in PATH
- stale VS Code session (restart)
