---
description: Connect this Proxmox MCP to your cluster, step by step
---

Guide the user through connecting `nandi-proxmox-mcp` to their own Proxmox. They
may never have configured an MCP server before, so explain each step in one
sentence before running it and never assume they know Proxmox terminology.

Work through these in order, stopping at each one until it succeeds.

## 1. Find out where they are

Run `npx nandi-proxmox-mcp list`.

- If it lists an instance, configuration already exists. Skip to step 4.
- If it says nothing is configured, continue.

## 2. Get an API token

Ask whether they already have a Proxmox API token.

If they do not, run `npx nandi-proxmox-mcp bootstrap --tier read-only` and tell
them to:

1. Open the Proxmox web UI in a browser.
2. Go to **Datacenter → Shell**.
3. Paste the block the command printed.
4. Copy the `value` from the table it prints — Proxmox shows it exactly once.

Point out why `--privsep 0` is in there: a token created through the web UI form
has privilege separation on by default and therefore no permissions at all,
which fails later as a 401 that looks like a wrong password.

Suggest `--tier read-only` unless they say otherwise. It can be raised later by
re-running setup, and starting permissive is hard to undo.

## 3. Run setup

Tell them to run `npx nandi-proxmox-mcp setup` **in their own terminal**, not
through you — it asks for a token secret, which should not pass through a
transcript.

Explain the two questions that carry consequences:

- **How much the AI can do.** `read-only` inspects, `read-execute` adds power
  management, `full` adds create, delete and running commands inside containers.
- **Whether they need commands inside containers.** Answering no skips SSH
  entirely. Almost everything works over the API without it, so no is the right
  answer unless they specifically want `pct exec`.

## 4. Check it

Run `npx nandi-proxmox-mcp doctor`.

Read the report back in plain language. A `[SKIP]` line is not a problem — it is
a check that was not requested. Only `[RED]` needs action, and each red line
carries a `fix:` line under it.

## 5. Prove it works

Tell them to restart their client so it picks up the server, then ask it to list
their Proxmox nodes. If node names come back, the setup is done.

If it fails, read the error `code` first — `PROXMOX_AUTH_FAILED` is the token,
`HOST_UNREACHABLE` and `DNS_RESOLUTION_FAILED` are almost always a VPN that is
not up, and `TLS_ERROR` means the self-signed certificate was not accepted.

## Ground rules

- Never ask them to paste a token secret or a private SSH key to you.
- Do not run `setup` on their behalf; it is interactive and handles a secret.
- If they have more than one Proxmox, run setup once per server with a different
  `--name`. Each gets its own credentials file and its own process, so a lab
  instance holds no credentials for production.
