# MCP Registry publish commands (manual)

## 1) Install mcp-publisher (Windows)
1. Download latest `mcp-publisher_windows_amd64.zip` from `modelcontextprotocol/registry` releases.
2. Extract `mcp-publisher.exe`.
3. Add its folder to `PATH`.
4. Verify:
```powershell
mcp-publisher --version
```

## 2) Initialize (optional)
```powershell
mcp-publisher init
```
Then replace generated `server.json` with `marketplace/mcp-registry/server.json`.

## 3) Login
```powershell
mcp-publisher login github
```
Open `https://github.com/login/device`, paste code, approve.

## 4) Publish to MCP registry
From folder that contains `server.json`:
```powershell
mcp-publisher publish
```

## 5) Verify listing
```powershell
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.NANDI-Services/nandi-proxmox-mcp"
```

