#!/bin/sh
# Prepares sshd for key-only batch access, matching what runSshBatch expects:
# BatchMode=yes, IdentitiesOnly=yes, PreferredAuthentications=publickey.
set -eu

if [ -z "${AUTHORIZED_KEY:-}" ]; then
  echo "AUTHORIZED_KEY is required (public key contents)" >&2
  exit 1
fi

# sshd sanitises the environment of login sessions, so container env vars never
# reach the remote command. Persist the node identity to a file the pct stub
# reads instead -- which is also closer to reality, where a node knows its own
# name from /etc/hostname.
printf '%s\n' "${PVE_NODE_NAME:-pve01}" > /etc/pve-node-name
printf '%s\n' "${PVE_FAKE_CONTROL_URL:-http://pve-api:8765}" > /etc/pve-control-url

# Host keys are generated per container start, never committed.
ssh-keygen -A

mkdir -p /root/.ssh
printf '%s\n' "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys

# In a real cluster /root/.ssh/authorized_keys is a symlink to
# /etc/pve/priv/authorized_keys on the shared pmxcfs filesystem, so the same key
# is accepted by every node and nodes can reach each other. Giving each node the
# matching private key reproduces that trust, which is what makes a hop
# (`ssh <peer> pct exec ...`) work.
if [ -n "${NODE_PRIVATE_KEY:-}" ]; then
  printf '%s\n' "$NODE_PRIVATE_KEY" > /root/.ssh/id_ed25519
  chmod 600 /root/.ssh/id_ed25519
fi

# sshd StrictModes refuses to authenticate if these are group/world writable.
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh

exec /usr/sbin/sshd -D -e
