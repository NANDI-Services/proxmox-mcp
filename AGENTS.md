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

## Runbook obligatorio para próximas releases

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

### 3) Pre-publish de paquete
- `npm pack --dry-run`
- `npm pack`
- No commitear `*.tgz`.

### 4) Publish npm
- `npm whoami`
- `npm publish --access public`
- Si pide OTP/browser auth: completar flujo de `https://www.npmjs.com/auth/cli/...`.
- Verificar: `npm view nandi-proxmox-mcp version`.

### 5) Publish MCP Registry / Marketplace
- `mcp-publisher login github` (siempre refrescar sesión antes de publish).
- `mcp-publisher validate marketplace/mcp-registry/server.json`
- `mcp-publisher publish marketplace/mcp-registry/server.json`

### 6) Regla de seguridad de release
- Si cualquier gate falla: detener publicación y corregir antes de continuar.

