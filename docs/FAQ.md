# FAQ

## Does npm give me a Proxmox token?
No. Every user must create the token in their own Proxmox server.

## Can I run without global install?
Yes. Use `npx nandi-proxmox-mcp ...`.

## Is Windows the only platform?
V1 is Windows-first for onboarding; core runtime is Node.js and can run elsewhere with compatible setup.

## Where are secrets stored?
In local generated config files ignored by git.

## Is HTTP transport supported?
Yes, with `MCP_TRANSPORT=http`, but `stdio` is the default and the right choice
for a desktop client.

Note that **the HTTP transport performs no authentication**: anyone who can
reach the port gets the full registered tool surface. Only enable it on a
trusted network or behind an authenticating reverse proxy. See the HTTP
hardening section of the README.

## I have never used an MCP before. Where do I start?
[EMPEZAR.md](EMPEZAR.md) — step by step, in Spanish, assuming no prior MCP
knowledge.
