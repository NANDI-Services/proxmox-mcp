# Quickstart

## Fast install (Windows)
```powershell
npm install -g nandi-proxmox-mcp
nandi-proxmox-mcp setup
nandi-proxmox-mcp doctor --check nodes,vms,cts,node-status,remote-op
```

## Fast run (without global install)
```powershell
npx nandi-proxmox-mcp setup
npx nandi-proxmox-mcp run
```

## What you need before setup
- Proxmox API token created in your own Proxmox panel.
- SSH key configured for batch mode on the Proxmox host.

Read full setup guides:
- `PROXMOX_SETUP.md`
- `SSH_SETUP.md`
- `VSCODE_SETUP.md`
