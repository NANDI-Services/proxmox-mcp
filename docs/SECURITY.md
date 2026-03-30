# Security Guide

## Scope

`nandi-proxmox-mcp` is a privileged infrastructure integration. It talks to:

- the Proxmox HTTPS API using a user-managed API token
- the Proxmox host over SSH for `pct`-based and host-side diagnostic workflows

The project does not attempt to hide that risk. It limits and documents it.

## What changed in the hardened release

- Critical dependency versions are pinned and reinforced with npm `overrides`.
- Package metadata now points to the canonical GitHub repository, issue tracker, and README for package verification.
- Streamable HTTP transport now enforces host validation, optional origin validation, request-size limits, rate limiting, and server timeouts.
- SSH execution rejects unsafe host/user values before the `ssh` binary is invoked.
- Child-process output is size-limited to avoid unbounded memory usage.
- `dockerLogsInContainer` no longer interpolates raw container names into a shell command.
- Registry, marketplace, plugin, and npm metadata are validated for version/link drift before release.

## Secret handling

Never commit:
- `tokenSecret`
- Proxmox API tokens
- private SSH keys
- `.nandi-proxmox-mcp/config.json`
- local registry login tokens

Redaction currently covers:
- Proxmox API token headers
- Bearer tokens
- `tokenSecret`
- `password` and `cipassword`

## Required permissions and why

### Proxmox API token

Needed for:
- inventory and status tools
- VM/LXC lifecycle tools
- configuration, snapshot, backup, network, firewall, and access tools

Recommendation:
- create a dedicated service account
- assign only the ACLs needed for the tier and tool set you expose
- prefer multiple scoped tokens over a single broad admin token

### SSH batch access

Needed for:
- `pve_ssh_batch_diagnostics`
- `pve_run_remote_diagnostic`
- `pve_exec_in_container`
- `pve_docker_ps_in_container`
- `pve_docker_logs_in_container`

Why it still exists:
- Proxmox API does not fully replace `pct exec`
- diagnosis of host-side SSH behavior requires real batch SSH

Mitigations:
- `ssh` is executed with `shell: false`
- SSH user/host values are validated before invocation
- public-key mode is enforced with `BatchMode=yes`, `IdentitiesOnly=yes`, and explicit auth/connect timeouts

## Access control model

- `PVE_ACCESS_TIER`
  - `read-only`
  - `read-execute`
  - `full`
- `PVE_MODULE_MODE`
  - `core`
  - `advanced`
- category and tool allow/deny filters

This is enforcement, not documentation only. Tools outside the policy are not registered.

## Destructive operations

`confirm=true` remains mandatory for destructive operations.

If confirmation is missing, the server returns:
- `ok: false`
- `error.code = CONFIRMATION_REQUIRED`
- impact guidance for the caller

This applies to:
- stop/shutdown/reboot/suspend/reset style lifecycle tools where state changes are meaningful
- delete/migrate/rollback/restore/update operations
- advanced arbitrary container execution

## HTTP transport hardening

When `MCP_TRANSPORT=http` is enabled:

- host header validation is always applied
- wildcard binds (`0.0.0.0` / `::`) use an allowlist that includes localhost plus configured runtime hosts and any explicit `MCP_ALLOWED_HOSTS`
- requests with an `Origin` header must match the configured/fallback allowed origin set
- `/mcp` is rate-limited
- oversized bodies receive sanitized `413` responses
- malformed JSON receives sanitized `400` responses
- stack traces are not returned to clients
- listener timeouts and header limits are applied at the Node HTTP server level

Important:
- this server is still an infrastructure endpoint
- if you expose it outside localhost, put it behind network policy and authentication

## Config and file handling

- config path input is resolved and validated before reading
- config files must be regular files and stay under a size limit
- control characters in config paths are rejected
- templates remain placeholder-only and do not contain live credentials

## TLS

`PROXMOX_ALLOW_INSECURE_TLS=true` is for controlled lab environments only.

Production guidance:
- keep it `false`
- use trusted certificates
- treat self-signed bypass as temporary

## Logging

Logs are JSON lines to stderr.

They are meant to be useful for operations, but they intentionally avoid:
- token secrets
- bearer tokens
- password-like fields
- private stack traces in client responses

## Vulnerability reporting

If the report is sensitive, use a GitHub Security Advisory.

If the report is operational/documentation-only and does not disclose exploitable detail, use:
- https://github.com/NANDI-Services/proxmox-mcp/issues

## Related docs

- [docs/PERMISSIONS.md](PERMISSIONS.md)
- [docs/THREAT_MODEL.md](THREAT_MODEL.md)
- [docs/RELEASE.md](RELEASE.md)
