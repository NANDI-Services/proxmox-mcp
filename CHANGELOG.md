# Changelog

## Unreleased

### Added: multiple Proxmox servers, and cluster-wide reach

- **Named instances.** One MCP server process per Proxmox. `setup --name <name>`
  writes that instance's credentials to its own file and registers it under its
  own key, so a production cluster and a lab box never share a process. Adding a
  second server is a second `setup` run, not manual JSON editing. `list` shows
  what is configured; `doctor --name <name>` checks one of them.
  The credentials are isolated by the operating system, not by a tool argument:
  the lab instance has no way to reach the cluster's token.
- **SSH tools now reach the whole cluster.** `pct` is node-local, so a container
  on a node other than the one you connect to was previously unreachable
  ("Configuration file 'nodes/pve01/lxc/202.conf' does not exist"). The server
  now resolves the owning node through `/cluster/resources` and reaches it,
  either directly or by hopping through the entry node — which works because a
  Proxmox cluster shares `/etc/pve/priv/authorized_keys` across all members, so
  one key is accepted everywhere. Standalone installs are unaffected.
  New optional config: `sshStrategy` (`auto` by default), `sshNodes` for
  per-node address overrides, and `sshNodeName`.
- **Setup discovers the installation instead of asking about it.** It reads
  `/cluster/status` to report whether this is a cluster or a standalone node,
  its name, its members and quorum, asks the entry node its own hostname, and
  probes which nodes are directly reachable. The discovered cluster name becomes
  the default instance name, so nobody has to invent one.
- **SSH failures are explained.** A rotated host key printed a fifteen-line
  banner with no guidance; it now yields one line naming the `ssh-keygen -R`
  fix. Rejected keys, refused connections and timeouts get the same treatment.
- New error codes `GUEST_NOT_FOUND` and `SSH_DISABLED`.

### Behavior changes

- **Non-idempotent operations are no longer retried.** `apiTool` now derives its
  retry policy from the descriptor's `idempotent` flag: idempotent reads keep
  three attempts, everything else gets one. Previously every tool inherited
  `maxAttempts: 3`, so a client-side timeout on `pve_qemu_create`,
  `pve_lxc_create`, `pve_*_clone`, or `pve_run_backup` could create duplicate
  resources — Proxmox may already have accepted the task the client gave up on.
  26 tools remain retryable; the rest now fail fast. The same applies to
  `pve_exec_in_container`, which was re-running arbitrary caller-supplied
  commands up to three times; allow-listed read-only diagnostics still retry.
- **Setup writes Claude Code config by default.** `setup` now writes both
  `.mcp.json` (Claude Code) and `.vscode/mcp.json`, merging into an existing
  file rather than replacing it, and refuses to overwrite a file it cannot
  parse. Use `--clients` to choose. Every written path is printed.

### Fixed

- **Connection and TLS failures are now classified instead of collapsing into
  `UNHANDLED_ERROR: fetch failed`.** `mapError` walks the `error.cause` chain and
  keys on Node error codes, adding `CONNECTION_REFUSED`,
  `DNS_RESOLUTION_FAILED`, `HOST_UNREACHABLE`, `CONNECTION_RESET`, and reliable
  `TLS_ERROR` detection. undici reports these on `cause`, which was never
  inspected, so the advertised TLS hint could never fire.
- **`describeProxmoxHttpError` is wired in.** Its 401/403/5xx messages and hints
  existed and were unit-tested but were connected to nothing, so authentication
  and ACL failures surfaced as `UNHANDLED_ERROR`. Now mapped to
  `PROXMOX_AUTH_FAILED`, `PROXMOX_ACL_FORBIDDEN`, `PROXMOX_NOT_FOUND`, and
  `PROXMOX_SERVER_ERROR`.
- **Non-JSON responses no longer masquerade as parse errors.** The client parsed
  the body before checking the status, so an HTML 502 from a reverse proxy threw
  `Unexpected token '<'` and never became a `ProxmoxHttpError`. Error bodies now
  carry a truncated snippet, and a non-JSON 2xx yields `PROXMOX_INVALID_RESPONSE`.
- **`doctor --check mcp-config` no longer fails outside this repo.** It required
  `mcp-manifest.json` in the current directory, a file that only exists in the
  source tree, so the check failed for every real user. The manifest is now
  validated only when present, and client configs are reported one line each.
- Abort detection no longer relies on `instanceof DOMException`, which is not
  stable across undici versions.

### Added

- **Dockerized Proxmox workflow emulator** (`emulator/`): a stateful fake of the
  Proxmox REST API over self-signed HTTPS plus a real `sshd` with a `pct` stub
  sharing its state. Supports mutating workflows and on-demand fault injection.
  Run with `npm run test:e2e`; see `emulator/README.md`. Excluded from the
  published package.
- First test coverage for `ProxmoxClient`'s request path, which previously had
  none, via the e2e suite.
- `setup --print-config` emits a paste-ready block for any MCP client.
- `setup --access-tier` / `--module-mode` write the policy into the client config
  env block. Note the server default remains `full`; setup now warns when the
  tier is left implicit.
- `docs/CLAUDE_CODE_SETUP.md`, including an error-code troubleshooting table.

### Documentation

- README no longer claims an enforced pre-commit documentation gate; no such
  hook exists. The real gate is the CI `docs/TOOLS.md` drift check.
- README now states plainly that the HTTP transport is **unauthenticated** and
  that `MCP_HOST` defaults to `0.0.0.0`.
- `docs/E2E_LIVE_REPORT.json` has been **removed**. It was a manual snapshot of
  one operator's cluster, presented as validation evidence but regenerated and
  checked by nothing. It is now gitignored, so a maintainer validating against
  their own Proxmox cannot commit their cluster's shape by accident. Reproducible
  verification is `npm run test:e2e` against the bundled emulator.
- The catalog test asserted `>= 120` tools while the docs advertised 143; it now
  asserts equality with the count published in `docs/TOOLS.md`.

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
