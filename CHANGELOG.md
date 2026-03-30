# Changelog

## 0.2.4 - 2026-03-30
- Pinned and synchronized critical dependency versions for `@modelcontextprotocol/sdk`, `undici`, `express`, `path-to-regexp`, and eslint-related tooling.
- Added npm `overrides`, verifiable package metadata, and release metadata validation for npm, MCP Registry, and marketplace artifacts.
- Hardened Streamable HTTP transport with explicit host/origin checks, request-size limits, timeouts, rate limiting, and sanitized 413/400/500 responses.
- Hardened SSH execution by validating host/user inputs, tightening SSH options, and limiting subprocess output buffers.
- Preserved all existing Proxmox, SSH, and container-management functionality while tightening helper input validation.
- Fixed marketplace plugin version drift and aligned release automation so registry publication follows npm publication instead of racing it.

## 0.2.0 - 2026-03-29
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
