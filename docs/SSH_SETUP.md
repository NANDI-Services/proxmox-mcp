# SSH Setup (Windows)

> **You may not need any of this.** SSH is only used by the tools that run
> commands inside containers (`pct exec` and the Docker helpers). Every REST
> tool — inventory, status, power, backups, storage, networking, firewall —
> works without it, and `setup` asks before requiring it.

## 0. Let the tool do both steps

```powershell
npx nandi-proxmox-mcp bootstrap --new-ssh-key
```

Generates the keypair correctly and includes the `authorized_keys` line in the
block you paste into **Datacenter → Shell**. If you use this, skip to step 3.

## 1. Generate key
```powershell
ssh-keygen -t ed25519 -C "nandi-proxmox-mcp"
```

Leave the passphrase **empty** — press Enter twice. The MCP connects
non-interactively and cannot answer a passphrase prompt.

> Do not try to pass an empty passphrase as `-N '""'` in PowerShell: that sets
> the literal two-character passphrase `""`. The key then looks fine, is
> accepted by `authorized_keys`, and fails every connection with
> `Permission denied (publickey)` — a message that says nothing about a
> passphrase. Check a suspect key with `ssh-keygen -y -f <key>`: if it prompts,
> it has one. Fix it in place, without re-authorizing, using
> `ssh-keygen -p -P '""' -N '' -f <key>`.

## 2. Copy public key to Proxmox host

There is no `ssh-copy-id` on Windows. Print the **public** half:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Then, in the Proxmox web UI under **Datacenter → Shell**, append it:

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
echo 'ssh-ed25519 AAAA... nandi-proxmox-mcp' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Only the `.pub` file ever leaves your machine. The private key never does.

**In a cluster you only do this once.** `/root/.ssh/authorized_keys` is a
symlink into pmxcfs, which is shared across all members, so authorizing on one
node authorizes every node.

## 3. Validate interactive SSH
```powershell
ssh user@your-proxmox-host
```

## 4. Validate non-interactive batch SSH (required)
```powershell
ssh -o BatchMode=yes -i $env:USERPROFILE\.ssh\id_ed25519 user@your-proxmox-host "echo ok"
```

If interactive works but batch fails, check:
- key path in config
- `authorized_keys` permissions
- `sshd_config` pubkey settings
- shell restrictions
