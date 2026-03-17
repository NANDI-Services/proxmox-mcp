# Contributing

## Requirements
- Node.js 20+
- npm 10+

## Local workflow
1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

## Design rules
- Keep modules complete (no empty exports or placeholder implementations).
- Keep secrets out of git.
- Preserve user-safe and actionable error messages.
- Maintain MCP tool contracts in `src/server/schemas.ts`.

## Pull request checklist
- [ ] Lint, typecheck, tests green
- [ ] No secrets in changed files
- [ ] Docs updated for user-facing changes
- [ ] Troubleshooting updated if incident pattern changed
