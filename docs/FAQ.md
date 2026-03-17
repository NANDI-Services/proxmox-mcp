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
No, v1 supports MCP `stdio` transport only.
