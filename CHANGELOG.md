# Changelog

## 0.2.0 (unreleased)
- Introduced declarative tool architecture (`ToolDescriptor` + endpoint descriptors) and policy engine.
- Added Core + Advanced capability model with access tiers, category/tool filters, and confirmation guardrails.
- Expanded Proxmox coverage to 140+ tools with generated catalog and metadata-driven docs (`docs/TOOLS.md`).
- Added Streamable HTTP transport support (`MCP_TRANSPORT=http`) with `/health` and `/ready`.
- Added Docker runtime artifacts and updated README for npx/Docker/HTTP integration.
- Hardened log redaction patterns and standardized tool registration metadata.
- Expanded tests with catalog/policy assertions and CI docs generation check.

## 0.1.4
- Updated `mcpName` to org namespace: `io.github.NANDI-Services/nandi-proxmox-mcp`.
- Published npm package `nandi-proxmox-mcp@0.1.4`.
- Published MCP Registry server entry under `NANDI-Services` org namespace.
- Updated marketplace listing/support links to `NANDI-Services/proxmox-mcp`.

## 0.1.3
- Added `mcpName` metadata for MCP Registry compatibility.
- Published package `0.1.3` with registry-aligned metadata.

## 0.1.2
- Fixed runtime version metadata alignment.
- Published package `0.1.2`.

## 0.1.1
- Fixed CLI `bin` path and runtime entry path (`dist/src/...`).
- Published package `0.1.1` to restore `npx` execution path.

## 0.1.0
- Initial production-ready v1 release of nandi-proxmox-mcp.
