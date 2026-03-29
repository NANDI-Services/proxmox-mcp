# Migration Notes 0.2.x

## Summary
Version `0.2.x` introduces a new descriptor-driven architecture, policy engine, access tiers, and a large tool expansion.

## Compatibility
- Legacy tool names are still available as aliases (`deprecated=true` metadata).
- Canonical naming now follows `pve_*` consistently.
- Existing setup/doctor flows remain supported.

## Key Runtime Changes
- New env flags:
  - `PVE_ACCESS_TIER=read-only|read-execute|full`
  - `PVE_MODULE_MODE=core|advanced`
  - `PVE_CATEGORIES=...`
  - `PVE_TOOL_BLACKLIST=...`
  - `PVE_TOOL_WHITELIST=...`
  - `MCP_TRANSPORT=stdio|http`
  - `MCP_HOST`, `MCP_PORT`
- New HTTP endpoints in remote mode:
  - `POST /mcp`
  - `GET /health`
  - `GET /ready`

## Destructive Operations
- Tools marked `confirmRequired=true` now reject calls without `confirm=true`.
- Update tools with mutable payloads reject empty updates via `TOOL_INPUT_REJECTED`.

## Legacy Aliases
Common aliases preserved:
- `listNodes` -> `pve_list_nodes`
- `listVMs` -> catalog legacy wrapper
- `listContainers` -> catalog legacy wrapper
- `getNodeStatus` -> `pve_get_node_status`
- `getVMStatus` -> `pve_get_qemu_status`
- `getContainerStatus` -> `pve_get_lxc_status`
- `startVM` / `stopVM` -> `pve_start_qemu_vm` / `pve_stop_qemu_vm`
- `startContainer` / `stopContainer` -> `pve_start_lxc_container` / `pve_stop_lxc_container`

## Recommended Post-upgrade Checks
1. `npm run build`
2. `npm run docs:tools`
3. `npx nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op`
