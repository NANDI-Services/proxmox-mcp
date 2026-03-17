# CI Secrets Policy

## Allowed CI secrets
- `NPM_TOKEN` for npm publish.
- Optional service tokens for CI integrations.

## Not allowed in CI
- End-user Proxmox host/token secrets.
- End-user SSH private keys.

## Separation model
- Local operator secrets stay local.
- CI secrets are only for pipeline infrastructure.

## Validation
CI runs secret scan and dependency audit on every PR/push.
