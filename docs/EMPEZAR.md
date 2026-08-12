# Empezar de cero

Guía para conectar tu Proxmox a un asistente de IA. Asume que sabés administrar
Proxmox y que **nunca configuraste un MCP**. No hace falta saber programar.

Son tres pasos y unos diez minutos.

---

## Qué es esto, en tres oraciones

Un **MCP** es un programa que le da herramientas a un asistente de IA. Este en
particular le da 143 herramientas para operar Proxmox: listar nodos, prender y
apagar máquinas, revisar backups, mirar el storage.

Vos seguís mandando. El asistente no puede hacer nada que vos no le hayas
habilitado, y las operaciones destructivas exigen una confirmación explícita.

---

## Antes de empezar

Necesitás dos cosas, nada más:

- **Node.js 20 o superior** en tu máquina. Verificalo con `node --version`. Si
  no lo tenés, bajalo de [nodejs.org](https://nodejs.org). El comando `npx` que
  vas a usar viene incluido.
- **Acceso al panel web de tu Proxmox**, con permiso para crear usuarios.

No necesitás instalar nada más. No necesitás clave SSH salvo que quieras
ejecutar comandos adentro de los contenedores, y eso lo decidís en el paso 2.

---

## Paso 1 — Crear el token en Proxmox

El token es una credencial que se crea **dentro de tu Proxmox**. Ni npm ni este
paquete pueden dártela; nadie más que vos puede crearla.

En tu terminal:

```bash
npx nandi-proxmox-mcp bootstrap --tier read-only
```

Ese comando **no se conecta a nada**. Sólo imprime los comandos que tenés que
correr, para que los leas antes de ejecutarlos.

Ahora:

1. Abrí tu Proxmox en el navegador.
2. Andá a **Datacenter → Shell**. Es una terminal como root dentro de Proxmox,
   y por eso no hace falta tener SSH todavía.
3. Pegá el bloque que imprimió el comando.
4. Copiá el valor de la columna `value` de la tabla que aparece.

> **Copialo ahora.** Proxmox muestra el secreto **una sola vez**. Si lo perdés,
> no se puede recuperar: hay que borrar el token y crear otro.

### Por qué el bloque dice `--privsep 0`

Es el detalle que más gente traba, y vale entenderlo.

Un token de Proxmox se crea por defecto con *privilege separation* activada. Con
esa opción, el token nace **sin ningún permiso**, incluso si el usuario dueño
los tiene todos. El resultado es que todo devuelve **401**, que parece un
secreto mal copiado. La gente vuelve a copiar el secreto una y otra vez, y el
problema nunca estuvo ahí.

`--privsep 0` hace que el token herede los permisos del usuario. Como el bloque
ya creó un usuario dedicado y acotado por ACL, eso es exactamente lo que querés.

### Si preferís hacerlo a mano

En el panel: **Datacenter → Permissions → API Tokens → Add**. Elegí el usuario,
poné un `Token ID`, y **destildá `Privilege Separation`**. Después, en
**Datacenter → Permissions → Add → User Permission**, asignale el rol
`PVEAuditor` sobre el path `/`.

El `Token ID` distingue mayúsculas: si lo creaste como `MCP`, más adelante
escribí `MCP`, no `mcp`.

---

## Paso 2 — Conectar

```bash
npx nandi-proxmox-mcp setup
```

Te va a hacer unas preguntas. La mayoría tiene una respuesta por defecto que
sirve: apretá Enter y seguí. Sólo dos importan de verdad.

### «¿Cuánto puede hacer la IA?»

| Opción | Qué habilita |
|---|---|
| `read-only` | Mirar todo, no tocar nada |
| `read-execute` | Además prender, apagar y reiniciar máquinas |
| `full` | Además crear, borrar y ejecutar comandos adentro de contenedores |

**Empezá en `read-only`.** Lo podés subir después re-corriendo `setup`; bajarlo
tarde, en cambio, no deshace lo que ya pasó.

### «¿Necesitás ejecutar comandos adentro de los contenedores?»

Si no estás seguro, la respuesta es **no**.

Eso saltea toda la configuración de SSH. Casi todo funciona sin SSH: inventario,
estado, prender y apagar, backups, storage, red, firewall. SSH sólo hace falta
para un puñado de herramientas que corren `pct exec` adentro de un contenedor.

Podés volver a correr `setup` más adelante si lo terminás necesitando.

### Qué escribe

| Archivo | Qué tiene | ¿Se commitea? |
|---|---|---|
| `.mcp.json` | El registro del servidor para Claude Code | **Sí.** Sólo tiene una ruta y ajustes |
| `.vscode/mcp.json` | Lo mismo para VS Code | Opcional |
| `.nandi-proxmox-mcp/<nombre>.json` | **Tu host y tu token** | **No.** Ya está en `.gitignore` |

---

## Paso 3 — Comprobar que anda

```bash
npx nandi-proxmox-mcp doctor
```

Vas a ver una lista de chequeos:

- `[GREEN]` — anduvo.
- `[SKIP]` — no se corrió porque no lo pediste. **No es un problema.**
- `[RED]` — falló. Abajo de cada uno hay una línea `fix:` con qué hacer.

Después **reiniciá tu cliente** (Claude Code, VS Code, el que uses) para que lea
la configuración nueva, y escribile:

```
listá mis nodos de Proxmox
```

Si te contesta con los nombres de tus nodos, ya está: terminaste.

Si no, seguí en «Cuando algo falla», más abajo.

---

## Los dos caminos de instalación

Ya elegiste sin darte cuenta: el de arriba, `npx`, funciona con cualquier
cliente. Esta tabla es sólo por si preferís el otro.

| Si usás | Hacé esto |
|---|---|
| **Claude Code** | Lo de arriba. `setup` escribe `.mcp.json` en tu proyecto |
| **Claude Code, con un click** | Instalá el plugin desde el marketplace. Después corré igual los pasos 1 y 2 para crear las credenciales |
| **VS Code** | Lo de arriba. `setup` escribe `.vscode/mcp.json` |
| **Cualquier otro** | `npx nandi-proxmox-mcp setup --print-config` imprime el bloque para pegar donde tu cliente lo pida |

El plugin y `npx` no son excluyentes: el plugin sólo registra el servidor, y las
credenciales las crea `setup` en los dos casos.

---

## Cuando algo falla

Los errores traen un `code`. Leé ese campo primero, es el que dice qué pasa.

| Código | Qué significa | Qué hacer |
|---|---|---|
| `PROXMOX_AUTH_FAILED` | Proxmox rechazó las credenciales | Revisá `privsep` (paso 1) antes que el secreto. Y ojo con las mayúsculas del nombre del token |
| `PROXMOX_ACL_FORBIDDEN` | El token entró pero no tiene permisos | Falta el rol. `pveum acl modify / --users mcp@pve --roles PVEAuditor` |
| `TLS_ERROR` | Rechazó el certificado | Proxmox usa un certificado autofirmado. Volvé a correr `setup` y aceptá el certificado autofirmado |
| `DNS_RESOLUTION_FAILED` | El nombre no resuelve | Error de tipeo, o el nombre sólo existe adentro de la VPN |
| `HOST_UNREACHABLE` | No hay ruta al host | Casi siempre es la VPN caída, no Proxmox |
| `CONNECTION_REFUSED` | El host contesta pero el puerto está cerrado | Proxmox usa el 8006 |
| `PROXMOX_INVALID_RESPONSE` | Contestó algo que no es la API | Suele ser un proxy inverso o una pantalla de login adelante |
| `CONFIRMATION_REQUIRED` | **No es un error** | Es la protección de operaciones destructivas. Pedíle al asistente que confirme |

**Sobre VPN:** si te conectás por VPN, `DNS_RESOLUTION_FAILED` y
`HOST_UNREACHABLE` significan el túnel casi siempre, no el servidor. Verificá
primero que la VPN esté levantada.

**Si SSH falla:** no bloquea nada más. Volvé a correr `setup` y contestá que no
necesitás ejecutar comandos adentro de contenedores; todas las herramientas de
API siguen andando.

---

## Preguntas que hace todo el mundo

**¿npm me da un token?**
No. El token lo creás vos en tu propio Proxmox. Nadie más puede.

**¿Esto manda mis datos a algún lado?**
No. El servidor corre en tu máquina y habla directo con tu Proxmox. Tu token
queda en un archivo local que ya está en `.gitignore`.

**¿Puedo usarlo con dos Proxmox distintos?**
Sí. Corré `setup` una vez por servidor con un `--name` distinto:

```bash
npx nandi-proxmox-mcp setup --name produccion
npx nandi-proxmox-mcp setup --name laboratorio
```

Cada uno queda con su propio archivo de credenciales y su propio proceso. El de
laboratorio no tiene manera de tocar producción, porque literalmente no tiene
sus credenciales. `npx nandi-proxmox-mcp list` te muestra los configurados.

**Tengo un cluster de varios nodos, ¿configuro uno por nodo?**
No. Apuntá a cualquier nodo del cluster y listo: la API de Proxmox ya alcanza a
todos los nodos desde uno solo. Para los comandos adentro de contenedores, el
servidor busca en qué nodo vive cada uno y llega solo.

**¿Y si me equivoco en una respuesta del `setup`?**
Volvé a correrlo. Sobrescribe la configuración de esa instancia sin tocar el
resto.

**¿Cómo lo saco?**
Borrá la entrada de `.mcp.json` y la carpeta `.nandi-proxmox-mcp/`. En Proxmox,
borrá el token con `pveum user token remove mcp@pve nandi`.

---

## Una advertencia que conviene leer

Estas herramientas operan infraestructura real. En el nivel `full`, el asistente
puede borrar máquinas y ejecutar comandos como root adentro de un contenedor, y
la única barrera es una confirmación que el propio modelo puede marcar.

Por eso: empezá en `read-only`, dale al token de Proxmox el permiso mínimo que
te sirva, y tratá ese token como lo que es, una credencial con alcance real.

Si querés el detalle completo: [`THREAT_MODEL.md`](THREAT_MODEL.md).

---

## Seguir leyendo

- [`CLAUDE_CODE_SETUP.md`](CLAUDE_CODE_SETUP.md) — referencia detallada, en inglés
- [`TOOLS.md`](TOOLS.md) — las 143 herramientas
- [`PERMISSIONS.md`](PERMISSIONS.md) — qué permisos necesita cada una
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — problemas menos frecuentes
