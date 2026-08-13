# Security Policy

`nandi-proxmox-mcp` manages real Proxmox infrastructure through API and SSH execution paths. It is designed with layered controls, but it is not a sandbox and it should be deployed and operated accordingly.

Additional operational guidance is available in [docs/SECURITY.md](docs/SECURITY.md), [docs/PERMISSIONS.md](docs/PERMISSIONS.md), and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Security Model & Residual Risk

This MCP server operates real Proxmox infrastructure and is not a sandboxed environment.

### Trust Assumptions
- The server is deployed in a trusted environment
- Only authorized operators can access it
- Network exposure is controlled (not publicly exposed)
- Credentials are securely managed

These assumptions are foundational. If they are not true in a given deployment, the effective risk profile changes materially.

### Residual Risks
The following risks are inherent to the system design:

- **Privileged Operations**  
  Full access tier and container execution capabilities can perform destructive or system-level actions.

- **SSH Execution Boundary**  
  Remote command execution relies on SSH and inherits the security posture of the target system.

- **Optional Insecure TLS Mode**  
  When enabled (`PROXMOX_ALLOW_INSECURE_TLS=true`), TLS certificate validation is bypassed and may expose connections to MITM attacks. Intended for lab use only.

- **External Dependency Synchronization**  
  Package distribution and listing visibility depend on npm, MCP Registry, and marketplace propagation timing.

These risks are documented explicitly because they cannot be eliminated without removing core capabilities of the server.

### Security Responsibilities
Users are responsible for:
- Restricting access to trusted operators only
- Using least-privilege API tokens and SSH keys
- Avoiding insecure TLS in production environments
- Properly securing the underlying infrastructure

In practice, that includes limiting network reachability, rotating credentials, applying host hardening on Proxmox nodes, and keeping the surrounding runtime and CI/CD environment under administrative control.

### Safety Controls Implemented
- Access tiers (read-only, read-execute, full)
- Confirmation required for destructive operations
- Human approval required for those same operations (see below)
- Input validation and command hardening
- Rate limiting and request validation

#### Human approval for destructive operations

`confirm=true` is answered by the calling agent, not by an operator, so it is a guard against an
accidental call rather than against a determined one. The 47 tools that require confirmation are
therefore also advertised with `_meta["anthropic/requiresUserInteraction"]: true`, which makes a
supporting client prompt a person on every call — including in permission modes that otherwise skip
prompts — with allow rules and hook approvals unable to satisfy it. `setup` and the `harden` command
additionally write matching `permissions.ask` rules.

Verified against Claude Code 2.1.229 on a live cluster: the prompt appears under `defaultMode: auto`,
and it appears again after answering *"Yes, and don't ask again"* — the resulting `allow` rule does
not retire the gate. Note that the option is still offered, contrary to the client documentation, so
its absence is not a usable signal that the guard is active.

Both are Claude Code specific (2.1.199 or later for the annotation). **Any other MCP client ignores
them**, leaving `confirm=true` and the access tier as the only controls, so operators on other
clients should treat the access tier as the primary boundary.

The project also applies metadata validation, package verification controls, dependency auditing, and release checks to reduce supply-chain and publication drift.

## Reporting

Report a vulnerability through:
- GitHub Security Advisories, preferably for sensitive reports
- [GitHub Issues](https://github.com/NANDI-Services/proxmox-mcp/issues) only when the report does not contain sensitive exploit details
