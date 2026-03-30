# Threat Model

## Assets

- Proxmox API token and effective ACL scope
- SSH private key and effective host permissions
- Proxmox cluster state
- VM/LXC lifecycle and configuration state
- host-side command execution path
- registry/npm/marketplace metadata used by installers and scanners

## Trust boundaries

- MCP client to local `stdio` runtime
- HTTP client to `/mcp`
- server to Proxmox HTTPS API
- server to host `ssh`
- local filesystem to config and key paths
- release pipeline to npm and MCP Registry

## Main abuse paths and mitigations

### 1. Cross-client state leakage in HTTP transport

Risk:
- message/session state reused across clients

Mitigation:
- stateless HTTP transport uses a fresh `McpServer` and `StreamableHTTPServerTransport` per request
- the SDK version is pinned to a range that includes the stateless transport reuse fix

### 2. DNS rebinding / host confusion

Risk:
- attacker targets wildcard bind or weak host validation

Mitigation:
- explicit host header enforcement
- wildcard binds use an allowlist
- requests carrying `Origin` are validated
- registry/docs tell operators to prefer localhost or protected networks

### 3. Command injection into local `ssh`

Risk:
- malicious host/user values interpreted as extra `ssh` options

Mitigation:
- local execution uses `spawn(..., { shell: false })`
- host and user values cannot start with `-` and cannot contain whitespace/control characters

### 4. Command injection into helper commands

Risk:
- helpers intended to be read-only become arbitrary shell execution

Mitigation:
- `dockerLogsInContainer` validates/escapes container names
- remote diagnostics keep an allowlist
- arbitrary container execution remains explicit, destructive, and confirmation-gated

### 5. Memory pressure from unbounded subprocess output

Risk:
- remote command output grows without limit

Mitigation:
- child-process output is capped
- overly noisy commands are terminated

### 6. Oversized or abusive HTTP requests

Risk:
- request body abuse, parser stress, excessive concurrency

Mitigation:
- body size limit
- rate limit
- request/header/keep-alive timeouts
- sanitized error handling

### 7. Supply-chain drift and unverifiable artifacts

Risk:
- published package differs from registry/marketplace metadata
- scanners cannot verify repository/source

Mitigation:
- pinned versions and npm overrides
- package metadata validation
- descriptor sync validation
- release order enforces `npm` before registry publish

## Residual risks

- `full` tier is still highly privileged by design.
- SSH-capable deployments remain sensitive because `pct exec` is powerful even with guardrails.
- `PROXMOX_ALLOW_INSECURE_TLS=true` weakens transport security and should remain lab-only.
- A mis-scoped Proxmox token can still grant more access than intended; the repo cannot fix bad ACL choices on the target cluster.
