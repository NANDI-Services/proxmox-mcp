# Proxmox workflow emulator

Runs a realistic Proxmox workflow end to end without a real cluster, so the MCP
server can be exercised — including mutating operations — on a laptop.

Proxmox VE is a bare-metal hypervisor and does not run as an ordinary container.
This emulator therefore models the two interfaces the MCP server actually talks
to, rather than trying to be Proxmox:

| Service | What it is | What it proves |
|---|---|---|
| `pve-api` | Stateful fake of the Proxmox REST API over **HTTPS with a self-signed cert** | URL building, the `PVEAPIToken` header, form-urlencoded bodies, the `{data}` envelope, the async UPID task lifecycle, and the TLS path |
| `pve-ssh` | Real `sshd` plus a `pct` stub backed by the same state | Key-only batch SSH, argv construction, and the `pct exec … bash -lc '…'` quoting in `src/ssh/pctExec.ts` |

The `pct` stub reads container state from the API fake's control plane, so the
REST and SSH views never disagree.

## Run it

```powershell
$env:AUTHORIZED_KEY = Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub -Raw
npm run emulator:up
npm run emulator:down
```

Defaults: API `https://127.0.0.1:18006`, control plane `http://127.0.0.1:18765`,
SSH `127.0.0.1:12222`. Override with `EMU_API_PORT`, `EMU_CTRL_PORT`,
`EMU_SSH_PORT`.

Default credentials (throwaway, emulator only):
`svc_mcp@pve!emu=emulator-secret-token`.

## Driven by the test suite

```powershell
npm run test:e2e
```

`tests/e2e/globalSetup.ts` generates a throwaway keypair, clears the stale
`known_hosts` entry, brings the stack up with `--wait`, and tears it down
afterwards. The suite is in its own vitest config so `npm test` stays fast and
needs no Docker.

## Fault injection

A healthy Proxmox never produces the failures the error-mapping layer must
classify, so the emulator produces them on request:

```powershell
curl.exe -s -X POST http://127.0.0.1:18765/_control/fault -d "mode=html-proxy&count=1"
```

| Mode | Simulates | Expected classification |
|---|---|---|
| `401` | bad token | `PROXMOX_AUTH_FAILED` |
| `403` | insufficient ACL | `PROXMOX_ACL_FORBIDDEN` |
| `500` | Proxmox internal error | `PROXMOX_SERVER_ERROR` |
| `html-proxy` | reverse proxy returning an HTML 502 | `PROXMOX_SERVER_ERROR` |
| `bad-json` | SSO/login page on a 200 | `PROXMOX_INVALID_RESPONSE` |
| `hang` | no response at all | `TIMEOUT` |

Connection-refused and TLS failures need no fault: point the client at a closed
port, or set `allowInsecureTls: false` against the self-signed cert.

Other control endpoints: `POST /_control/reset`, `GET /_control/health`.

## Scope and honesty

- Not published to npm. `package.json` uses a `files` allowlist, so `emulator/`
  is excluded from the tarball.
- Certificates and SSH host keys are generated at container start and never
  committed — CI runs a blocking gitleaks scan.
- The `pct` stub executes the forwarded command inside its own throwaway
  container. That is deliberate: it is the only way to genuinely exercise the
  single-quote escaping, and the container is disposable and never published.
- **This is not Proxmox.** It reproduces the wire contract and the workflow, not
  Proxmox's own behaviour. Before trusting a change against a real cluster, run
  `scripts/validate-live-tools.mjs` against one.
