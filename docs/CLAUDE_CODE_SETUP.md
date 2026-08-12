# Using this MCP with Claude Code (and any other agent CLI)

## Before you start

You need two things from your own Proxmox server. Neither is provided by npm or
by this package:

1. **An API token** — see `PROXMOX_SETUP.md`.
2. **An SSH key** in batch mode — see `SSH_SETUP.md`. Only the SSH-backed tools
   (`pve_exec_in_container`, `pve_run_remote_diagnostic`, the Docker helpers)
   need this; the REST tools work without it.

## Setup

From your project directory:

```powershell
npx nandi-proxmox-mcp setup --access-tier read-only
```

This writes:

| File | Purpose | Commit it? |
|---|---|---|
| `.mcp.json` | Claude Code server registration | Yes — it holds only a path and policy settings |
| `.vscode/mcp.json` | VS Code registration | Optional |
| `.nandi-proxmox-mcp/config.json` | **Your host and API token** | **No** — already gitignored |

Restart Claude Code, then confirm the server is connected with `/mcp`.

### Start read-only

`--access-tier read-only` is deliberate. The server's built-in default is
`full`, which registers every destructive tool — delete, restore, ACL changes,
and arbitrary command execution inside containers. Passing the flag records the
tier in `.mcp.json` so the decision is visible instead of implicit:

```json
{
  "mcpServers": {
    "nandi-proxmox-mcp": {
      "command": "npx",
      "args": ["nandi-proxmox-mcp", "run"],
      "env": {
        "NANDI_PROXMOX_CONFIG": "C:\\path\\to\\.nandi-proxmox-mcp\\config.json",
        "PVE_ACCESS_TIER": "read-only"
      }
    }
  }
}
```

Tiers: `read-only` (inspect only) → `read-execute` (adds power management) →
`full` (adds create/delete/config/exec). Raise it by editing `PVE_ACCESS_TIER`
or re-running setup.

Independently, `PVE_MODULE_MODE` defaults to `core`; `advanced` adds the user,
ACL, and firewall management tools plus the Docker helpers.

## More than one Proxmox

Run `setup` once per server. Each run creates a separate instance with its own
credentials file and its own entry in the client config:

```powershell
npx nandi-proxmox-mcp setup --name production-cluster
npx nandi-proxmox-mcp setup --name lab
```

If you omit `--name`, setup uses the cluster name it discovered — so on a
cluster called `datacenter` you get an instance called `datacenter`
automatically.

```powershell
npx nandi-proxmox-mcp list
npx nandi-proxmox-mcp doctor --name lab
```

The instance name becomes the tool prefix, so in Claude Code you will see
`production-cluster` tools and `lab` tools as two clearly separate groups.

**Why separate processes rather than one server with a "target" argument:** each
instance runs on its own, holding only its own token. The lab instance has no
credentials for the production cluster, so it cannot touch it even if something
goes wrong. That guarantee comes from the operating system, not from a tool
argument the model has to get right. It also lets you give each one a different
access tier — production read-only, lab full.

Use `--scope user` to store an instance in your home directory instead of the
current project, so it is available from every directory you work in.

## Clusters

Nothing extra to configure. Point setup at any node of the cluster:

- The **REST API** is cluster-wide already — Proxmox forwards requests to the
  right node, so listing, creating and managing guests works across all members
  from the single endpoint you configured.
- **Container command execution** (`pct exec`) is node-local in Proxmox, so the
  server looks up which node holds the container and reaches it: directly if
  that node is reachable from your machine, otherwise by hopping through the
  node you connected to. Setup tells you which of the two applies per node.

If a node is only reachable at an address the cluster does not advertise (a VPN
or NAT address), add an override to the instance's config file:

```json
{
  "sshNodes": {
    "pve02": { "host": "10.8.0.12" }
  }
}
```

Set `"sshStrategy": "disabled"` to turn off SSH entirely and use REST tools only.

## Other clients

`setup` writes Claude Code and VS Code directly. For anything else:

```powershell
npx nandi-proxmox-mcp setup --print-config
```

That prints a paste-ready block in both common shapes plus the raw command and
environment variables, and writes nothing to disk. Most MCP clients need only:

- command: `npx`
- args: `nandi-proxmox-mcp run`
- env: `NANDI_PROXMOX_CONFIG` pointing at your config file

Write specific clients with `--clients claude-code` or `--clients vscode`.

## Verify

```powershell
npx nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op
```

`doctor` reports one line per client config found. A client you do not use is
skipped, not failed. If no config is found at all, it tells you to run `setup`.

## If something fails

The server distinguishes connection failures, so read the error `code` first:

| Code | Meaning | Usual fix |
|---|---|---|
| `CONNECTION_REFUSED` | Host reachable, port closed | Wrong port, or `pveproxy` is down |
| `DNS_RESOLUTION_FAILED` | Hostname does not resolve | Typo, or the name only resolves over VPN |
| `HOST_UNREACHABLE` | No route | VPN tunnel down, or a firewall in between |
| `TLS_ERROR` | Certificate rejected | Proxmox self-signs by default: trust the CA, or set `allowInsecureTls` for lab use |
| `PROXMOX_AUTH_FAILED` | 401 | Check token name, secret, user, and realm |
| `PROXMOX_ACL_FORBIDDEN` | 403 | The token's role lacks a privilege on that path |
| `PROXMOX_INVALID_RESPONSE` | Reply was not JSON | A proxy or login page is answering instead of the API |
| `CONFIRMATION_REQUIRED` | Guard, not a failure | Re-run the tool with `confirm: true` |

Over a VPN, `DNS_RESOLUTION_FAILED` and `HOST_UNREACHABLE` almost always mean
the tunnel, not the server.

## A note on trust

These tools operate real infrastructure. `pve_exec_in_container` runs arbitrary
commands as root inside a container, and its only gate is a `confirm: true` flag
that the model itself can set. Start at `read-only`, scope the Proxmox token's
ACL to the minimum, and treat the token as a credential with real blast radius.
`docs/THREAT_MODEL.md` has the full picture.
