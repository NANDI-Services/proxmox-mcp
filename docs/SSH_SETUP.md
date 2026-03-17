# SSH Setup (Windows)

## 1. Generate key
```powershell
ssh-keygen -t ed25519 -C "nandi-proxmox-mcp"
```

## 2. Copy public key to Proxmox host
Use your preferred method to append `.pub` key into `~/.ssh/authorized_keys` on the target host.

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
