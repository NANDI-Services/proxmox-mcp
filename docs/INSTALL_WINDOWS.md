# Install on Windows

## 1. Install prerequisites
- Node.js 20+
- OpenSSH client (`ssh` command available)

## 2. Install package
```powershell
npm install -g nandi-proxmox-mcp
```

## 3. Run guided setup
```powershell
nandi-proxmox-mcp setup
```
The wizard asks for:
- Proxmox host/port
- user/realm
- token name/secret
- SSH host/port/user/key path

## 4. Validate
```powershell
nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

## 5. One-command script
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-win.ps1
```

