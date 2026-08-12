<!-- doc-governance:map v1 -->
sealed_sha: b63463a721a4654ccace54ca515a2a6e0327b450
sealed_at: 2026-08-12T21:03:35.913Z
tool_version: 0.9.5
sealed_dirty:
  - f0709425a8bf3980258dbf820df700975932d4ab graphify-out/.graphify_labels.json
  - 3cedd86a96389c3886cb528143a19fed33aecea8 graphify-out/.graphify_labels.json.sig
  - 945c9b46d684f08ec84cb316e1dc0061e361f794 graphify-out/.graphify_root
  - 5e1d0e6965377eb9d3bff99c0e6ee8da51cd0597 graphify-out/GRAPH_REPORT.md
  - 2dc79c38790d7f66c0f9e9f8e620613a354acbc3 graphify-out/cache/ast/v0.9.28/2904574bdd1dbab3eaac300ed99b4858b6a22e8699e7f9641b5680fbb152204d.json
  - 98b871788f4114037d9e89c807eceaab13ad5a5e graphify-out/cache/ast/v0.9.28/31e299b2d9e150878db36b8a226e1f3b69b7bb1f6e57eeb09cf19d429254e8a3.json
  - c995e118fbe36888f677c4f82c2d9ba42e701f7b graphify-out/cache/ast/v0.9.28/47529530caa443f9d92a685d4002db3426f4e1e9282c5fc1e2e6dfa0dd5365c3.json
  - a3736a361e94113a3ab8aab8695050f70fb462f2 graphify-out/cache/ast/v0.9.28/4ec6eb5f3aededede0cf29046f53fc3d5e22ab42500cd7cd24f4461d0943c5e4.json
  - 3184a99edbc7964e12f61bfd6fb4869db9573928 graphify-out/cache/ast/v0.9.28/7c4a7ff53d2a314510d4c19d58c5692a9ec44e9bfedaeaf569ae4ea7c721a4a1.json
  - c2ebe047c4ea4c1c43243d474bd1762ba67a6d7d graphify-out/cache/ast/v0.9.28/8114b3acbe164cccfb54235f59e53684ed089ba834bae6d1c7774f7479d4a87b.json
  - f1394988c691b2548db015bf163ec2d16e6b539b graphify-out/cache/ast/v0.9.28/d32f5f0e26b8b425507d5d0b8f5e8c624c331f016b88f857509fbfd870fb50b1.json
  - 91a85bb3f588b70d333485d05eb0ab9586d64831 graphify-out/cache/ast/v0.9.28/dad89c4bd37dd380f50cbb1c9538cb272723f26a4ec07d7ceb375a31de1e6061.json
  - f9bffabbdee3b8f29072c8930958911e47e4e7ed graphify-out/cache/ast/v0.9.28/dde86906ff0b7fdc39b7cf96b6223d722a6160a21530fe156b90336c8843b6c5.json
  - 62ae86ed81c3d44a608673cf7fcd5055d9bb6694 graphify-out/cache/ast/v0.9.28/e12e5f6dce8d6a45a58383eb10b34e830f4af81dfaf718878b7fe427e2d3ec63.json
  - db36e177f0eb2489930781b8ea98d0b874f064b8 graphify-out/cache/stat-index.json
  - 4d08976a6ba55345a489b454966303283da8401a graphify-out/graph.html
  - 798f8d1580fbc93552bafa6d49d3142a5920bd27 graphify-out/graph.json
  - 6faf03bfaa4a55bb039a2ba707a06651c7e34216 graphify-out/manifest.json

## Inventory

### AGENTS.md
title: AGENTS.md
headings:
  - H1: AGENTS.md
  - H2: Release Fastpath (Lecciones de la sesión)
  - H3: Por qué se demoró
  - H3: Errores cometidos
  - H3: Qué se aprendió
  - H2: Runbook obligatorio para próximas releases
  - H3: 1) Gates técnicos (bloqueantes)
  - H3: 2) Runtime smoke (HTTP)
  - H3: 3) Pre-publish de paquete
  - H3: 4) Publish npm
  - H3: 5) Publish MCP Registry / Marketplace
  - H3: 6) Regla de seguridad de release
  - H2: Documentation Sync Gate (Mandatory)
  - H3: Trigger
  - H3: Required doc check (always)
  - H3: Blocking rule
  - H3: Allowed exception: `no-doc-change`
  - H3: Closure report requirement
code_refs:
  - .nandi-proxmox-mcp/config.json
  - /health
  - /mcp
  - /ready
  - 127.0.0.1
  - AGENTS.md
  - CONTRIBUTING.md
  - README.md

### CHANGELOG.md
title: Changelog
headings:
  - H1: Changelog
  - H2: Unreleased
  - H3: Added: multiple Proxmox servers, and cluster-wide reach
  - H3: Behavior changes
  - H3: Fixed
  - H3: Added
  - H3: Documentation
  - H2: 0.2.4 - 2026-03-30
  - H2: 0.2.0 - 2026-03-29
  - H2: 0.1.4
  - H2: 0.1.3
  - H2: 0.1.2
  - H2: 0.1.1
  - H2: 0.1.0
code_refs:
  - .mcp.json
  - .vscode/mcp.json
  - /cluster/resources
  - /cluster/status
  - /etc/pve/priv/authorized_keys
  - /health
  - /ready
  - 0.0.0.0
  - 0.1.1
  - 0.1.2
  - 0.1.3
  - @modelcontextprotocol/sdk
  - NANDI-Services/proxmox-mcp
  - dist/src/...
  - docs/CLAUDE_CODE_SETUP.md
  - docs/E2E_LIVE_REPORT.json
  - docs/TOOLS.md
  - emulator/
  - emulator/README.md
  - error.cause
  - io.github.NANDI-Services/nandi-proxmox-mcp
  - mcp-manifest.json

### CLAUDE.md
title: CLAUDE.md
headings:
  - H1: CLAUDE.md
  - H2: What this is
  - H2: Commands
  - H2: Architecture
  - H3: Tools are data, not handlers
  - H3: Every call goes through the guardian
  - H3: Which tools exist depends on the environment
  - H3: REST is cluster-wide; SSH is not
  - H3: One process per Proxmox
  - H3: Transports
  - H2: Testing
  - H2: Publishing boundaries
code_refs:
  - .agents/
  - .claude/
  - .mcp.json
  - .vscode/mcp.json
  - /cluster/resources
  - /etc/pve/priv/authorized_keys
  - AGENTS.md
  - docs/E2E_LIVE_REPORT.json
  - docs/TOOLS.md
  - emulator/
  - emulator/README.md
  - error.cause
  - package.json
  - process.env
  - scripts/validate-live-tools.mjs
  - src/
  - src/config/clients.ts
  - src/config/instances.ts
  - src/guardian/errorMap.ts
  - src/guardian/guardian.ts
  - src/proxmox/client.ts
  - src/server/mcpServer.ts
  - src/server/policy.ts
  - src/server/toolRegistry.ts
  - src/ssh/nodeRouter.ts
  - src/tools/catalog.ts
  - tests/
  - tests/unit/retry-policy.test.ts
  - vitest.config.ts
  - vitest.e2e.config.ts

### CODE_OF_CONDUCT.md
title: Code of Conduct
headings:
  - H1: Code of Conduct
  - H2: Our Commitment
  - H2: Expected Behavior
  - H2: Unacceptable Behavior
  - H2: Scope
  - H2: Reporting
  - H2: Enforcement
code_refs: []

### CONTRIBUTING.md
title: Contributing
headings:
  - H1: Contributing
  - H2: Requirements
  - H2: Local workflow
  - H2: Design rules
  - H2: Documentation sync gate (pre-commit)
  - H2: Pull request checklist
code_refs:
  - AGENTS.md
  - CONTRIBUTING.md
  - README.md
  - src/server/schemas.ts

### COOKBOOK.md
title: COOKBOOK
headings:
  - H1: COOKBOOK
  - H2: 1) Cluster inventory and visibility
  - H3: Get a quick cluster overview
code_refs: []

### README.md
title: NANDI Proxmox MCP
headings:
  - H1: NANDI Proxmox MCP
  - H2: What stays enabled
  - H2: Required permissions
  - H2: Destructive confirmations
  - H2: Access tiers
  - H2: Runtime configuration
  - H3: Environment variables
  - H3: Local config file
  - H2: Quick start
  - H2: Security Model & Residual Risk
  - H3: Trust Assumptions
  - H3: Residual Risks
  - H3: Security Responsibilities
  - H3: Safety Controls Implemented
  - H2: HTTP hardening
  - H2: SSH and command-execution hardening
  - H2: Security posture
  - H2: Publish flow
  - H2: Development
  - H2: Documentation Maintenance Policy
  - H2: Docs
  - H2: Registry and marketplace
  - H2: License
code_refs:
  - .git/hooks/pre-commit
  - .github/workflows/ci.yml
  - .mcp.json
  - .nandi-proxmox-mcp/config.json
  - .vscode/mcp.json
  - /mcp
  - 0.0.0.0
  - 127.0.0.1
  - AGENTS.md
  - CONTRIBUTING.md
  - README.md
  - core.hooksPath
  - docs/TOOLS.md
  - release.yml

### SECURITY.md
title: Security Policy
headings:
  - H1: Security Policy
  - H2: Security Model & Residual Risk
  - H3: Trust Assumptions
  - H3: Residual Risks
  - H3: Security Responsibilities
  - H3: Safety Controls Implemented
  - H2: Reporting
code_refs: []

### docs/CI_SECRETS.md
title: CI Secrets Policy
headings:
  - H1: CI Secrets Policy
  - H2: Allowed CI secrets
  - H2: Not allowed in CI
  - H2: Separation model
  - H2: Validation
code_refs: []

### docs/CLAUDE_CODE_SETUP.md
title: Using this MCP with Claude Code (and any other agent CLI)
headings:
  - H1: Using this MCP with Claude Code (and any other agent CLI)
  - H2: Before you start
  - H2: Setup
  - H3: Start read-only
  - H2: More than one Proxmox
  - H2: Clusters
  - H2: Other clients
  - H2: Verify
  - H2: If something fails
  - H2: A note on trust
code_refs:
  - .mcp.json
  - .nandi-proxmox-mcp/config.json
  - .vscode/mcp.json
  - /mcp
  - PROXMOX_SETUP.md
  - SSH_SETUP.md
  - docs/THREAT_MODEL.md

### docs/FAQ.md
title: FAQ
headings:
  - H1: FAQ
  - H2: Does npm give me a Proxmox token?
  - H2: Can I run without global install?
  - H2: Is Windows the only platform?
  - H2: Where are secrets stored?
  - H2: Is HTTP transport supported?
code_refs: []

### docs/INSTALL_WINDOWS.md
title: Install on Windows
headings:
  - H1: Install on Windows
  - H2: 1. Install prerequisites
  - H2: 2. Install package
  - H2: 3. Run guided setup
  - H2: 4. Validate
  - H2: 5. One-command script
code_refs: []

### docs/MARKETPLACE_GO_LIVE.md
title: Marketplace Go-Live Checklist
headings:
  - H1: Marketplace Go-Live Checklist
  - H2: Before publishing
  - H2: MCP Registry
  - H2: Marketplace / plugin artifacts
  - H2: Post-publish checks
  - H2: Security review items
code_refs:
  - .mcp/server.json
  - docs/SECURITY.md
  - marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json
  - marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json
  - marketplace/listing.md
  - marketplace/mcp-registry/server.json
  - marketplace/security.md

### docs/MIGRATION_0_2.md
title: Migration Notes 0.2.x
headings:
  - H1: Migration Notes 0.2.x
  - H2: Summary
  - H2: Compatibility
  - H2: Key Runtime Changes
  - H2: Destructive Operations
  - H2: Legacy Aliases
  - H2: Recommended Post-upgrade Checks
code_refs:
  - 0.2.x

### docs/PERMISSIONS.md
title: Permissions and Trust Boundaries
headings:
  - H1: Permissions and Trust Boundaries
  - H2: Proxmox API token
  - H2: SSH access
  - H2: Why SSH is not removed
  - H2: Confirmation model
  - H2: Tier model
  - H2: Network exposure
code_refs:
  - 0.0.0.0

### docs/PROXMOX_SETUP.md
title: Proxmox Setup (API Token + ACL)
headings:
  - H1: Proxmox Setup (API Token + ACL)
  - H2: Important
  - H2: Create API token
  - H2: Assign minimum ACL
  - H2: 403 ACL runbook
  - H3: Symptom
  - H3: Cause
  - H3: Fix
code_refs: []

### docs/QUICKSTART.md
title: Quickstart
headings:
  - H1: Quickstart
  - H2: Fast install (Windows)
  - H2: Fast run (without global install)
  - H2: Fast repeatable setup (existing Proxmox server)
  - H2: Doctor against your real Proxmox
  - H2: One-command Windows install
  - H2: What you need before setup
code_refs:
  - .nandi-proxmox-mcp/config.json
  - .vscode/mcp.json
  - PROXMOX_SETUP.md
  - SSH_SETUP.md
  - VSCODE_SETUP.md

### docs/RELEASE.md
title: Release and Publish Guide
headings:
  - H1: Release and Publish Guide
  - H2: Required order
  - H2: npm
  - H2: MCP Registry
  - H2: Marketplace
  - H2: CI/CD behavior
  - H2: Troubleshooting
  - H3: `npm audit` fails because of a withdrawn or dev-only advisory
  - H3: npm package verification complains about repository/source
  - H3: Registry publish fails after npm publish succeeded
  - H3: Marketplace listing does not refresh
code_refs:
  - .mcp/server.json
  - ci.yml
  - marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/.mcp.json
  - marketplace/agent-plugin-marketplace/plugins/nandi-proxmox-mcp/plugin.json
  - marketplace/mcp-registry/server.json
  - mcp-publish.yml
  - package.json
  - package.json.bugs
  - package.json.homepage
  - package.json.repository
  - release.yml

### docs/RELEASE_NOTES_0.1.4.md
title: Release Notes - v0.1.4
headings:
  - H1: Release Notes - v0.1.4
  - H2: nandi-proxmox-mcp v0.1.4 is live
  - H3: Highlights
  - H3: Install
  - H3: Registry verification
  - H2: Public announcement copy (short)
  - H2: Launch checklist
code_refs:
  - 0.1.4
  - io.github.NANDI-Services/nandi-proxmox-mcp
  - v0.1.4

### docs/RELEASE_NOTES_0.2.0.md
title: Release Notes 0.2.0
headings:
  - H1: Release Notes 0.2.0
  - H2: What’s New
  - H2: Security & Reliability
  - H2: Migration Notes
code_refs:
  - docs/MIGRATION_0_2.md
  - docs/TOOLS.md

### docs/RELEASE_NOTES_0.2.1.md
title: Release Notes 0.2.1
headings:
  - H1: Release Notes 0.2.1
  - H2: Highlights
  - H2: Notes
code_refs: []

### docs/SECURITY.md
title: Security Guide
headings:
  - H1: Security Guide
  - H2: Scope
  - H2: What changed in the hardened release
  - H2: Secret handling
  - H2: Required permissions and why
  - H3: Proxmox API token
  - H3: SSH batch access
  - H2: Access control model
  - H2: Destructive operations
  - H2: HTTP transport hardening
  - H2: Config and file handling
  - H2: TLS
  - H2: Logging
  - H2: Vulnerability reporting
  - H2: Related docs
code_refs:
  - .nandi-proxmox-mcp/config.json
  - /mcp
  - 0.0.0.0

### docs/SSH_SETUP.md
title: SSH Setup (Windows)
headings:
  - H1: SSH Setup (Windows)
  - H2: 1. Generate key
  - H2: 2. Copy public key to Proxmox host
  - H2: 3. Validate interactive SSH
  - H2: 4. Validate non-interactive batch SSH (required)
code_refs:
  - .pub

### docs/THREAT_MODEL.md
title: Threat Model
headings:
  - H1: Threat Model
  - H2: Assets
  - H2: Trust boundaries
  - H2: Main abuse paths and mitigations
  - H3: 1. Cross-client state leakage in HTTP transport
  - H3: 2. DNS rebinding / host confusion
  - H3: 3. Command injection into local `ssh`
  - H3: 4. Command injection into helper commands
  - H3: 5. Memory pressure from unbounded subprocess output
  - H3: 6. Oversized or abusive HTTP requests
  - H3: 7. Supply-chain drift and unverifiable artifacts
  - H2: Residual risks
code_refs:
  - /mcp

### docs/TOOLS.md
title: Tool Catalog
headings:
  - H1: Tool Catalog
  - H2: Count By Category
  - H2: Tools
code_refs: []

### docs/TROUBLESHOOTING.md
title: Troubleshooting
headings:
  - H1: Troubleshooting
  - H2: 1) Proxmox 403 Forbidden (highest priority)
  - H3: Symptoms
  - H3: Likely cause
  - H3: Fix
  - H2: 2) SSH interactive works, batch fails
  - H3: Symptoms
  - H3: Fix checklist
  - H2: 3) TLS certificate errors
  - H2: 4) Token invalid/expired
  - H2: 5) MCP server missing in VS Code
  - H2: 6) Remote operation timeouts
  - H2: 7) MCP config invalid or not discovered
  - H3: Symptoms
  - H3: Fix
  - H2: 8) Manifest install fails
  - H3: Symptoms
  - H3: Fix
code_refs:
  - .vscode/mcp.json
  - /
  - mcp-manifest.json

### docs/VSCODE_SETUP.md
title: VS Code MCP Setup
headings:
  - H1: VS Code MCP Setup
  - H2: 1. Run setup
  - H2: 2. Option A: Add server manually (Custom server)
  - H2: 3. Option B: Install from manifest
  - H2: 4. Validate response
  - H2: 5. Validate local compatibility
  - H2: 6. Common issues
code_refs:
  - .vscode/mcp.json
  - mcp-manifest.json

### emulator/README.md
title: Proxmox workflow emulator
headings:
  - H1: Proxmox workflow emulator
  - H2: Run it
  - H2: Driven by the test suite
  - H2: Fault injection
  - H2: Scope and honesty
code_refs:
  - emulator/
  - package.json
  - scripts/validate-live-tools.mjs
  - src/ssh/pctExec.ts
  - tests/e2e/globalSetup.ts

### marketplace/agent-plugin-marketplace/README.md
title: Agent Plugin Marketplace scaffold
headings:
  - H1: Agent Plugin Marketplace scaffold
  - H2: How to use
  - H2: Plugin payload
  - H2: Notes
code_refs:
  - NANDI-Services/nandi-plugins-marketplace
  - plugins/nandi-proxmox-mcp/.mcp.json
  - plugins/nandi-proxmox-mcp/plugin.json

### marketplace/listing.md
title: nandi-proxmox-mcp Marketplace Listing
headings:
  - H1: nandi-proxmox-mcp Marketplace Listing
  - H2: Short Description
  - H2: Long Description
  - H3: Why this server
  - H3: Security Notes
  - H3: Install Source
  - H3: Support
  - H3: Category Suggestions
  - H3: Assets
code_refs:
  - marketplace/icon.png
  - marketplace/screenshot-setup.png
  - mcp-manifest.json

### marketplace/mcp-registry/README.md
title: MCP Registry manual fallback
headings:
  - H1: MCP Registry manual fallback
  - H2: Publish
  - H2: Verify
  - H2: Notes
code_refs:
  - .mcp/server.json
  - marketplace/mcp-registry/server.json
  - release.yml

### marketplace/security.md
title: Marketplace Security Notes
headings:
  - H1: Marketplace Security Notes
  - H2: Authentication model
  - H2: Secret handling
  - H2: Minimum ACL
  - H2: Known high-impact failure modes
  - H2: Runtime hardening
  - H2: TLS self-signed caution
  - H2: Token rotation
code_refs:
  - .nandi-proxmox-mcp/config.json
  - docs/TROUBLESHOOTING.md
