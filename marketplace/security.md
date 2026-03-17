# Marketplace Security Notes

## Authentication model
- Proxmox API token only.
- Token must be created by each user in their own Proxmox environment.

## Secret handling
- No host/token secrets are committed to git.
- Sensitive runtime config is generated locally in `.nandi-proxmox-mcp/config.json`.

## Minimum ACL
Grant only the permissions required by enabled operations:
- audit/read for inventory and status
- power management only if start/stop operations are needed

## Known high-impact failure modes
1. HTTP 403 due to insufficient ACL.
2. SSH interactive works but batch mode fails.

Both have runbooks in `docs/TROUBLESHOOTING.md`.

## TLS self-signed caution
`allowInsecureTls=true` is for controlled lab environments only.
Prefer trusted TLS certificates in production.

## Token rotation
1. Create new token.
2. Update local config.
3. Run `doctor` checks.
4. Revoke old token.
