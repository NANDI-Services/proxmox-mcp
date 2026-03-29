# Release Notes 0.2.0

## What’s New
- Major architecture upgrade to descriptor-driven tooling:
  - `ToolDescriptor` metadata model
  - endpoint descriptors for reusable Proxmox API wiring
  - centralized policy engine
- Core + Advanced capability split with strict security controls.
- Access tiers (`read-only`, `read-execute`, `full`) and category/tool filtering.
- Destructive operations now require explicit `confirm=true`.
- Streamable HTTP transport support (`MCP_TRANSPORT=http`) with:
  - `POST /mcp`
  - `GET /health`
  - `GET /ready`
- Expanded tool coverage to 140+ cataloged tools.
- Generated tool documentation:
  - `docs/TOOLS.md`

## Security & Reliability
- Extended log redaction patterns for token/password-like fields.
- Input guardrails for update-style operations (`TOOL_INPUT_REJECTED` on empty mutable payloads).
- Improved testing coverage including:
  - catalog/policy contract tests
  - HTTP transport integration tests

## Migration Notes
- Legacy tool names remain available via aliases (deprecated metadata).
- New runtime controls:
  - `PVE_ACCESS_TIER`
  - `PVE_MODULE_MODE`
  - `PVE_CATEGORIES`
  - `PVE_TOOL_BLACKLIST`
  - `PVE_TOOL_WHITELIST`
  - `MCP_TRANSPORT`, `MCP_HOST`, `MCP_PORT`
- Full migration details:
  - `docs/MIGRATION_0_2.md`
