# Security Guide

## Secret handling
- Never commit `tokenSecret` or private keys.
- Local config is generated at `.nandi-proxmox-mcp/config.json`.
- Templates under `templates/` contain placeholders only.

## Minimum privilege
Grant only required ACL permissions to the token user:
- Read inventory/status permissions for list/status operations.
- Power-management permissions only if start/stop tools are needed.

## 403 Forbidden behavior
When ACL is insufficient, tools return explicit guidance:
- Error code: `PROXMOX_ACL_FORBIDDEN`
- Message explains ACL issue
- Hint points to minimum ACL correction

## Token rotation (safe)
1. Create a new token in Proxmox.
2. Update local config with new token.
3. Run `nandi-proxmox-mcp doctor`.
4. Revoke old token.

## TLS self-signed certificates
Self-signed TLS may fail validation by default.
Use `allowInsecureTls=true` only in controlled labs, and prefer proper trusted certificates in production.
