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

## Documentation sync gate (pre-commit)
- Before commit-ready handoff, review relevance for `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`.
- Update every relevant document in the same change set.
- If no documentation update is required, add an explicit `no-doc-change` justification with verifiable scope.
- Do not close a task as done while this gate is unresolved.

## Pull request checklist
- [ ] Lint, typecheck, tests green
- [ ] No secrets in changed files
- [ ] Docs updated for user-facing changes
- [ ] Documentation sync gate passed (`README.md` / `AGENTS.md` / `CONTRIBUTING.md` or explicit `no-doc-change`)
- [ ] Troubleshooting updated if incident pattern changed
