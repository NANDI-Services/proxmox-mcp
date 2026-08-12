# Proxmox Setup (API Token + ACL)

## Important
The API token is not provided by npm or this MCP package. You must create it in your Proxmox server.

## The short way

```bash
npx nandi-proxmox-mcp bootstrap --tier read-only
```

Prints the `pveum` commands that create the user, grant the role and issue the
token. Paste them into **Datacenter → Shell** in the web UI. It contacts
nothing, so you can read every line before running it.

## Create API token by hand

1. Open the Proxmox web UI.
2. **Datacenter → Permissions → Users → Add**: create a dedicated user, e.g.
   `mcp` in realm `pve`. Do not reuse `root@pam`.
3. **Datacenter → Permissions → API Tokens → Add**: pick that user, set a
   `Token ID`, and **untick `Privilege Separation`**.
4. Copy the `Secret` immediately. Proxmox displays it once and cannot show it
   again.

### Privilege separation is the one to get right

Left on — the default — the token is issued with **no permissions at all**,
independently of what its user is allowed to do. Every request then fails with
**401**, which is indistinguishable from a mistyped secret and sends most people
into re-copying the secret repeatedly.

Turning it off makes the token inherit its user's permissions, which is why the
user must be a scoped one rather than root.

Fix an existing token without recreating it:

```bash
pveum user token modify mcp@pve nandi --privsep 0
```

### The Token ID is case-sensitive

A token created as `MCP` must be entered as `MCP`. A case mismatch also returns
401. `pveum user token list mcp@pve` prints the exact string.

## Assign minimum ACL

Grant only what the tools you enabled actually need:

| Access tier | Role | Command |
|---|---|---|
| read-only | `PVEAuditor` | `pveum acl modify / --users mcp@pve --roles PVEAuditor` |
| read-execute | `PVEAuditor` + `PVEVMUser` | `pveum acl modify / --users mcp@pve --roles PVEAuditor,PVEVMUser` |
| full | `PVEAdmin` | `pveum acl modify / --users mcp@pve --roles PVEAdmin` |

Narrow the path from `/` to something like `/vms/101` to scope it further.

## 403 ACL runbook
### Symptom
Tool fails with HTTP 403.

### Cause
ACL for token user is insufficient for requested endpoint.

### Fix
1. Identify failing endpoint from logs/doctor output.
2. Update ACL on relevant path (`/nodes/<node>` or broader path if required).
3. Re-run doctor checks.
