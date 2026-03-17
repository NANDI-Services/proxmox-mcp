# Quickstart

## Fast install (Windows)
```powershell
npm install -g nandi-proxmox-mcp
nandi-proxmox-mcp setup
nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

## Fast run (without global install)
```powershell
npx nandi-proxmox-mcp setup
npx nandi-proxmox-mcp run
```

## Fast repeatable setup (existing Proxmox server)
```powershell
npx nandi-proxmox-mcp setup `
  --proxmox-host <PROXMOX_HOST> `
  --proxmox-user <PROXMOX_USER> `
  --token-name <TOKEN_NAME> `
  --token-secret "<TOKEN_SECRET>" `
  --ssh-key-path "$env:USERPROFILE\\.ssh\\id_ed25519" `
  --skip-connectivity
```

This writes `.nandi-proxmox-mcp/config.json` and `.vscode/mcp.json` without waiting on live connectivity checks.

## Doctor against your real Proxmox
```powershell
npx nandi-proxmox-mcp doctor `
  --check mcp-config,nodes,vms,cts,node-status,remote-op `
  --ctid <CTID>
```

Use `--ctid` only if you want to validate `pct exec` inside a real container.

## One-command Windows install
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-win.ps1 `
  -ProxmoxHost <PROXMOX_HOST> `
  -ProxmoxUser <PROXMOX_USER> `
  -TokenName <TOKEN_NAME> `
  -TokenSecret "<TOKEN_SECRET>" `
  -DoctorCtid <CTID>
```

## What you need before setup
- Proxmox API token created in your own Proxmox panel.
- SSH key configured for batch mode on the Proxmox host.

Read full setup guides:
- `PROXMOX_SETUP.md`
- `SSH_SETUP.md`
- `VSCODE_SETUP.md`

