# AGENTS.md

## Release Fastpath (Lecciones de la sesión)

### Por qué se demoró
- Se intentó validar/publicar con supuestos de host local (`127.0.0.1`) en un entorno que usa host real remoto.
- Se mezclaron tareas de hardening, validación y publicación sin cerrar primero un gate único de release.
- La publicación se frenó por autenticación externa (npm 2FA y token expirado del registry MCP).

### Errores cometidos
- Priorizar un escenario de runtime local antes de confirmar la configuración real del entorno (`.nandi-proxmox-mcp/config.json`).
- Intentar publicar marketplace con token expirado en lugar de refrescar login primero.
- Ejecutar `npm publish` sin considerar de entrada el flujo de OTP/browser de npm.

### Qué se aprendió
- En este repo, validar host debe partir de config real (`proxmoxHost`/`sshHost`) y no de defaults locales.
- Publicación segura requiere orden estricto: `validar -> empaquetar -> npm -> marketplace`.
- Errores de red/auth no son de código: hay que aislarlos rápido para no perder tiempo.

## Releases: automáticas por push a main

**No se tagea a mano.** `auto-release.yml` corre en cada push a `main`, deriva el nivel del bump
de los conventional commits desde el último tag `v*`, escribe la versión con
`scripts/set-version.mjs`, commitea `chore(release): vX.Y.Z`, tagea, y el push del tag dispara
`release.yml`, que es quien publica.

- `feat` → minor · `fix`/`perf`/`revert` → patch · `!` o footer `BREAKING CHANGE:` → **major**
  (semver estricto: un breaking en 0.x va a 1.0.0, no a 0.4.0).
- `chore`, `docs`, `test`, `ci`, `build`, `style`, `refactor` **no publican**. Un push que sólo
  los contenga termina en verde sin release, y lista los commits que descartó.
- Los commits que no matchean conventional commits se ignoran, no rompen la corrida.
- **Antes de confiar en un cambio de la lógica de versionado, correr el workflow con
  `dry_run: true`** desde Actions: calcula, bumpea y corre los gates, imprime el diff y no
  commitea nada.
- El guard `if:` que saltea los commits `chore(release):` es lo único que evita que el workflow
  se dispare a sí mismo en loop. No reemplazarlo por `[skip ci]`: eso suprime eventos push, y el
  push del tag es uno — saltearía el release que acaba de preparar.

**Una sola fuente de versión.** Hay ocho lugares que la llevan (manifiestos, descriptores,
espejo del marketplace, docs y dos literales de TypeScript). `scripts/set-version.mjs` los
escribe todos y falla si alguna regla no matchea; `validate-package-metadata.mjs` los verifica
todos contra `package.json`. Al agregar un lugar nuevo hay que tocar **los dos**: un escritor
que toca un archivo que el validador no mira es exactamente cómo 0.3.1 salió publicado
diciendo ser 0.2.4.

Requisito de infraestructura: el secret `RELEASE_TOKEN` (fine-grained PAT o GitHub App con
`Contents: write`) tiene que estar en el bypass del ruleset `main-branch-protection`. Sin eso
el push del bump a main lo rechaza la protección de rama.

**El registry de npm es eventually consistent, y eso rompió el release de 0.3.2.** El paso que
verifica la versión publicada corría a menos de un segundo del publish y leía la versión
*anterior*: `0.3.2` se publicó `05:39:27.336Z` y el check todavía veía `0.3.1` a `05:39:28.09`.
El publish había funcionado; falló el que lo mira. Ahora reintenta 12 veces cada 10s.

Corolario que costó caro: el job murió después de publicar a npm pero antes del MCP Registry y
del GitHub Release, y **re-ejecutarlo moría en `npm publish`** por versión ya publicada, así que
la única salida era a mano. Ahora `Publish to npm` saltea si la versión ya está en el registry.
Cualquier paso de publicación que se agregue tiene que ser re-ejecutable igual: un release es
una secuencia de escrituras en sistemas distintos, y va a cortarse en el medio alguna vez.

Al completar un release a mano: `gh release create vX.Y.Z --generate-notes` para el Release, y
el workflow `mcp-publish.yml` (`workflow_dispatch`) para el descriptor del registry.

**Verificar convergencia sin pipe.** `node scripts/verify-registry-entry.mjs ... | tail` devuelve
el exit code de `tail`, no del script — da 0 con el registry desincronizado. Redirigir a archivo
y leer `$?`.

## Runbook para releases manuales (fallback)

### 1) Gates técnicos (bloqueantes)
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm audit --include=dev --audit-level=moderate`
- `npm ls express` (solo 5.x)
- `npm ls path-to-regexp` (solo 8.x)

### 2) Runtime smoke (HTTP)
- Usar `MCP_HOST=0.0.0.0` en validación de despliegue.
- Verificar `/health`, `/ready`, `/mcp`.
- Verificar rechazo por host inválido, parse error JSON, invalid JSON-RPC y rate limit 429.

### 2b) Gate humano sobre operaciones destructivas (bloqueante)

El gate vive en el `_meta` del `tools/list`, no en la lógica del tool, así que un refactor del
registry puede desactivarlo sin romper un solo test de comportamiento. Verificar el cable, no el
código, contra el build que se va a publicar:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | PVE_ACCESS_TIER=full PVE_MODULE_MODE=advanced node dist/src/cli/main.js run
```

- Esperado: 47 tools con `anthropic/requiresUserInteraction: true`.
- Los aliases (`stopVM`, `stopContainer`, `execInContainer`) tienen que estar marcados: son nombres
  de tool separados en el protocolo y su `_meta` se arma en otra rama del registry.
- `pve_start_qemu_vm`, `startVM` y cualquier tool de lectura tienen que salir **sin** la marca.

### 3) Pre-publish de paquete
- `npm pack --dry-run`
- `npm pack`
- No commitear `*.tgz`.

### 4) Publish npm

**El publish lo hace `release.yml` al pushear el tag `v*`, no a mano.** El paquete usa
trusted publishing (OIDC) contra `NANDI-Services/proxmox-mcp` + `release.yml`, así que no hay
`NPM_TOKEN` en el repo y no hace falta.

- **Requisito no obvio: npm >= 11.5.1 y Node >= 22.14.0 en el runner.** El intercambio OIDC lo
  hace el CLI de npm. Con un CLI viejo `npm publish` ni lo intenta, busca un token clásico, no
  lo encuentra y falla con `ENEEDAUTH` — que se lee como "falta el secret" y manda a buscar el
  problema al lugar equivocado. Pasó con Node 20 (npm 10.x) en v0.3.0.
- Con trusted publishing la provenance sale sola; `--provenance` es redundante.
- Verificar después: `npm view nandi-proxmox-mcp version`.
- Fallback manual (sólo si el trusted publishing no está disponible): `npm whoami` +
  `npm publish --access public`, completando el flujo OTP/browser de
  `https://www.npmjs.com/auth/cli/...`.

### 5) Publish MCP Registry / Marketplace
- `mcp-publisher login github` (siempre refrescar sesión antes de publish).
- `mcp-publisher validate marketplace/mcp-registry/server.json`
- `mcp-publisher publish marketplace/mcp-registry/server.json`

### 6) Regla de seguridad de release
- Si cualquier gate falla: detener publicación y corregir antes de continuar.

## Documentation Sync Gate (Mandatory)

### Trigger
- Run this gate before closing any `change`, `fix`, `refactor`, release step, or commit-ready handoff.

### Required doc check (always)
Evaluate relevance and update if needed:
- `README.md` for user/operator behavior, setup, usage, runtime contract, or security posture changes.
- `AGENTS.md` for agent workflow, runbook, release process, or operating policy changes.
- `CONTRIBUTING.md` for contributor workflow, Definition of Done, review checklist, or PR policy changes.

### Blocking rule
Task closure is blocked unless one of these is true:
- Relevant docs were updated in the same change set.
- A `no-doc-change` justification is provided with a verifiable reason tied to the exact change scope.

### Allowed exception: `no-doc-change`
- Must be explicit and auditable.
- Must explain why no user, operator, agent-process, or contributor-facing contract changed.
- Generic reasons such as "small change" or "internal only" are not sufficient without scope evidence.

### Closure report requirement
Every task closeout must include:
- Which of `README.md`, `AGENTS.md`, `CONTRIBUTING.md` were updated.
- If none were updated, the exact `no-doc-change` justification.
