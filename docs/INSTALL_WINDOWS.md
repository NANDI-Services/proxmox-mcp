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

For a faster non-interactive install:
```powershell
nandi-proxmox-mcp setup `
  --proxmox-host <PROXMOX_HOST> `
  --proxmox-user <PROXMOX_USER> `
  --token-name <TOKEN_NAME> `
  --token-secret "<TOKEN_SECRET>" `
  --ssh-key-path "$env:USERPROFILE\\.ssh\\id_ed25519"
```

## 4. Validate
```powershell
nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

To validate remote container execution too:
```powershell
nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op --ctid <CTID>
```

## 5. One-command script
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-win.ps1 `
  -ProxmoxHost <PROXMOX_HOST> `
  -ProxmoxUser <PROXMOX_USER> `
  -TokenName <TOKEN_NAME> `
  -TokenSecret "<TOKEN_SECRET>" `
  -DoctorCtid <CTID>
```

