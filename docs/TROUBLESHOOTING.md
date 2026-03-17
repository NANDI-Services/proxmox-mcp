# Troubleshooting

## 1) Proxmox 403 Forbidden (highest priority)
### Symptoms
- Tools fail with 403.
- Inventory or control operations return ACL errors.

### Likely cause
Token ACL is missing required path permissions.

### Fix
1. Open Proxmox web panel.
2. Check token user permissions at `/` or specific `/nodes/<node>` paths.
3. Add minimum permissions required by target operation.
4. Retry `nandi-proxmox-mcp doctor`.

## 2) SSH interactive works, batch fails
### Symptoms
- `ssh user@host` works interactively.
- `ssh -o BatchMode=yes user@host "echo ok"` fails.

### Fix checklist
- Verify `~/.ssh` and `authorized_keys` permissions.
- Verify correct private key path in setup.
- Verify `sshd` allows pubkey auth.
- Verify default shell is not restricted.

## 3) TLS certificate errors
If using self-signed certs, either trust the cert properly or set insecure TLS only in non-production environments.

## 4) Token invalid/expired
Regenerate token in Proxmox and update local config.

## 5) MCP server missing in VS Code
- Confirm `.vscode/mcp.json` exists.
- Confirm command is `npx nandi-proxmox-mcp run`.
- Restart VS Code.

## 6) Remote operation timeouts
- Check network latency and SSH responsiveness.
- Increase timeout/backoff settings if needed.
