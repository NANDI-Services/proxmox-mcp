# Permissions and Trust Boundaries

## Proxmox API token

The server needs a user-managed Proxmox API token for all API-backed tools.

Recommended baseline:
- dedicated service user for MCP
- no shared human-admin token
- only the ACLs required for the active tools and selected `PVE_ACCESS_TIER`

Typical capability mapping:
- read inventory/status/logs
  - nodes, VMs, LXC, tasks, storage, metrics
- read-execute
  - start, resume, backup run, selected operational tasks
- full
  - create, update, delete, migrate, restore, firewall/access changes

## SSH access

SSH is required because some supported capabilities are host-side by nature:
- `pct exec`
- SSH batch diagnostics
- Docker inspection inside containers via `pct exec`

Requirements:
- non-interactive key-based auth
- SSH user allowed to run the required `pct` or inspection commands on the target host
- a private key path available to the runtime

## Why SSH is not removed

Removing SSH would reduce functionality and break existing supported tools:
- `pve_exec_in_container`
- `pve_run_remote_diagnostic`
- `pve_ssh_batch_diagnostics`
- `pve_docker_ps_in_container`
- `pve_docker_logs_in_container`

The hardened release preserves those tools and instead tightens:
- CLI argument validation before `ssh` is invoked
- public-key-only SSH settings
- connection/output limits
- input validation on container-name-based helpers

## Confirmation model

Destructive operations require `confirm=true`.

This includes:
- delete/migrate/rollback/restore flows
- most state-changing stop/shutdown/reboot/suspend flows
- arbitrary command execution inside containers

## Tier model

- `read-only`
  - safe for inventory and visibility use cases
- `read-execute`
  - adds selected execution/lifecycle controls
- `full`
  - adds write/admin operations

`PVE_MODULE_MODE=core` further reduces the attack surface by hiding advanced tools.

## Network exposure

If HTTP transport is enabled:
- prefer binding to localhost
- if you bind to `0.0.0.0` or `::`, set `MCP_ALLOWED_HOSTS`
- optionally set `MCP_ALLOWED_ORIGINS` when requests may carry an `Origin` header
- place the server behind network controls; this project is not an internet-facing public API
