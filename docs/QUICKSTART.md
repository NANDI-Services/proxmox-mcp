# Quickstart

> **These examples are PowerShell.** Line continuations use a backtick and paths
> use `$env:USERPROFILE`. On macOS and Linux use `\` and `$HOME` instead — the
> commands themselves are identical.
>
> New to MCP servers? [EMPEZAR.md](EMPEZAR.md) walks through the whole thing
> step by step instead of assuming you know which flags you want.

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

- A Proxmox API token, created in your own Proxmox. npm cannot give you one.
- An SSH key **only** if you want to run commands inside containers. Every REST
  tool works without it, and setup asks before requiring any of it.

The fastest way to the token is to let the tool write the commands for you:

```powershell
npx nandi-proxmox-mcp bootstrap --tier read-only --new-ssh-key
```

It connects to nothing. Paste its output into the Proxmox web UI under
**Datacenter → Shell**, which needs no SSH access of its own.

Read full setup guides:
- `EMPEZAR.md` (step by step, Spanish)
- `PROXMOX_SETUP.md`
- `SSH_SETUP.md`
- `VSCODE_SETUP.md`

