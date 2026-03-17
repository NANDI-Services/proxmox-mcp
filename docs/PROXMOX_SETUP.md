# Proxmox Setup (API Token + ACL)

## Important
The API token is not provided by npm or this MCP package. You must create it in your Proxmox server.

## Create API token
1. Open Proxmox web UI.
2. Create a dedicated service user (recommended).
3. Create API token for that user.
4. Copy token name and token secret securely.

## Assign minimum ACL
Assign only the permissions needed for your target operations:
- Inventory/status: audit/read permissions.
- Power actions: VM/CT power management permissions.

## 403 ACL runbook
### Symptom
Tool fails with HTTP 403.

### Cause
ACL for token user is insufficient for requested endpoint.

### Fix
1. Identify failing endpoint from logs/doctor output.
2. Update ACL on relevant path (`/nodes/<node>` or broader path if required).
3. Re-run doctor checks.
