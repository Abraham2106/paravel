# Capas — kit de inicio (antes de Paravel)

Piezas reutilizables: **abrir cosas del SO desde una UI**. Sirven en Paravel y en cualquier otro proyecto. Paravel todavía no es el foco.

La UI puede ser React (Vite u otro bundler). Eso no cambia el modelo: **el navegador no lanza procesos**. Quien lanza es un **host** nativo, chico, al lado.

```text
[ UI React ]  --comando JSON-->  [ Host ]  --argv fijo-->  [ VS Code / Firefox / Explorador ]
                     ^                    |
                     |                    +--> log auditable
                     no hay PowerShell improvisado
```

---

## Qué hace cada capa

| Capa | Vive en | Puede | No puede |
| --- | --- | --- | --- |
| **UI** | React | Mostrar piezas, marcar, pedir “iniciar”, pintar iconos que ya le dio el host | `code .`, abrir Firefox, leer el disco a ciegas |
| **Protocolo** | JSON / tipos | Decir *qué* se quiere, no *cómo* | Conocer rutas de `firefox.exe` |
| **Host** | Tauri v2 (Rust) | Validar, resolver binario, spawn con argv, log | `shell:allow-execute` en el frontend, PowerShell, regex como única defensa |
| **Adaptador** | Una función por tipo | Un argv conocido | Un adaptador que hace de todo |

La app “qué haría”: la UI manda `{ "op": "open", "kind": "vscode", "path": "C:\\proj" }`. El host comprueba que `kind` está permitido, que `path` es una carpeta que existe y está en una lista blanca (o bajo un root), y ejecuta exactamente:

`Code.exe --new-window "C:\proj"`

No concatena eso en `powershell -Command`. Así se debuggea: el log enseña el argv; si falla, es el mismo comando contra ese `.exe`.

---

## Permisos (Windows, usuario normal)

Abrir VS Code, Firefox o un PDF **no pide UAC**. Corre como el mismo usuario de la app.

Lo que sí hay que cuidar:

- El **renderer** (React) no spawnea. Solo el host, por un canal explícito (IPC Tauri/Electron, o HTTP localhost con token).
- Nunca `shell: true` + texto del usuario. Argv en array.
- Allowlist de `kind`. Un `kind` nuevo = un adaptador nuevo, no un “comando libre”.
- Paths: absolutos, normalizados, sin `..` que salgan del root permitido.
- Tauri: capabilities en el manifiesto (más auditable). Electron: el default es demasiado permisivo; hay que cerrarlo.
- Una app **solo web** (sin host): esto no se puede hacer. Ahí termina la investigación, no hay truco de Vite.

---

## Cómo se implementa cada gesto

### 1. Abrir VS Code / Cursor en una carpeta

En PowerShell, `code .` funciona porque el cwd es esa carpeta y `code` está en PATH.

Desde una app es lo mismo, sin el punto mágico:

- `code --new-window "C:\Users\...\el-repo"`
- o `cursor "C:\Users\...\el-repo"`

El host: resuelve `Code.exe` / `Cursor.exe` (ruta conocida, no el `.cmd` del PATH). Si el binario no está, error claro: “no encuentro Code.exe”, no un stack de spawn.

Debug: log `argv = ["C:\\...\\Code.exe", "--new-window", path]`. Lo pegas en una terminal y debe hacer lo mismo.

### 2. Abrir “una aplicación”

Windows: `CreateProcess` / `ShellExecute` sobre el `.exe` o el alias (`start`).

La app no “entra dentro” de VS Code. **Arranca otro proceso** y le pasa argumentos. VS Code es dueño de su ventana.

### 3. Icono de un documento / app

La UI no lo inventa. Pide al host: `{ "op": "icon", "path": "C:\\x\\readme.md" }`.

El host usa el shell de Windows (`SHGetFileInfo` / thumbnail). Devuelve PNG o data-URL. React solo pinta `<img>`.

Eso es “cargar el icono dentro de la aplicación”: **consulta al SO, no al bundler**. Vite no sabe qué icono tiene un `.docx` en este Windows.

Cache por extensión + path; no extraer el icono en cada render.

### 4. Serie de pestañas en Firefox

Dos problemas distintos:

| Quieres | Cómo | Dificultad |
| --- | --- | --- |
| Abrir **estas URLs** (la selección es de Paravel / de tu app) | `firefox.exe --new-window url1 url2 url3` | Fácil, auditable |
| Reusar las pestañas que el usuario ya tiene abiertas en Firefox | Extensión, o leer `sessionstore` (frágil) | No es v1 |

El modelo sencillo: **la selección vive en tu app** (lista de URLs de la pieza). El host lanza Firefox con esa lista. No le pides a Firefox “las tabs que marqué en su UI”.

Perfil opcional: `-P nombre` si más adelante aíslas sesiones. v1: URLs + ventana nueva.

Chrome/Edge: el mismo patrón, otro adaptador, otro exe.

---

## Seguridad y auditoría (el diseño, no un framework)

Un comando = un struct. Ejemplo mental, no esquema final:

```text
op: open | icon
kind: vscode | cursor | firefox | folder | file
payload: path o urls[]
request_id: uuid
```

El host:

1. Parsea JSON (falla si sobra basura).
2. Switch por `kind` — si no existe, rechazo.
3. Valida payload (path existe; urls son `http(s)`).
4. Construye argv **en código**, no con interpolación.
5. Spawnea, captura exit / error.
6. Append-only log: tiempo, request_id, kind, argv, resultado.

Debug: “reproduce este request_id”. Clean: un archivo por adaptador, ~20 líneas. Optimizado: el hot path es spawn + log; sin capa de plugins el día uno.

Lo que no entra en el kit: MCP, Grok Bot, PowerShell generado, `eval`.

---

## Capas del kit (reutilizable)

```text
protocol/     tipos del comando (sin OS)
host/         proceso nativo, allowlist, log
  adapters/   vscode, cursor, firefox, folder, file, icon
ui/           React: lista de piezas, iconos, botón iniciar
              habla solo protocol → host
```

## Host elegido: Tauri v2

Tauri, no Electron. El renderer sigue sin spawn. El binario Rust es el host.

Hay dos formas de enchufar el shell. Solo una es auditable de verdad:

| Camino | Quién spawnea | Qué corta el disparo |
| --- | --- | --- |
| `Command.create("abrir-vscode")` desde React + `shell:allow-execute` | Plugin, con scope en JSON | Regex/literales del capability. **No** comprueba que el path exista ni que esté bajo un root. |
| `invoke("abrir_vscode")` → Rust `Command::new` | Tu comando | Lo que valides en Rust. Ojo: las llamadas Rust a `ShellExt` **no** pasan por el scope del plugin (lo dice el changelog de tauri-plugin-shell). |

Para este kit: **el frontend no tiene `shell:allow-execute`**. Solo `invoke` a comandos nuestros. El JSON de capabilities lista *esos* comandos, no `code` genérico. La validación fuerte (canonicalize, es carpeta, prefijo permitido, urls `http(s)`) vive en un solo sitio en Rust, al lado del log. El regex en el plugin no sustituye eso: `^[^;&|]+$` no es un path seguro; en Windows la inyección no va por `;` si ya usas argv.

Windows: no uses `code` ni `code.cmd` como proceso del host. Firefox: `firefox.exe` con ruta, no el nombre suelto del PATH. El argv del log tiene que ser el real.

**No spawnees `.cmd` / `.bat`.** En Windows, `std::process::Command` sobre un `.cmd` arranca `cmd.exe /c`. Ahí sí hay shell y `;` `|` `&` vuelven a importar. El adaptador de VS Code llama a `Code.exe` (p. ej. bajo `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`). Cursor: `Cursor.exe`. Firefox: `firefox.exe`. El `.cmd` del PATH es atajo de terminal, no el mecanismo del host.

URI `vscode://file/...` es otro adaptador (opener / ShellExecute), no el mismo que spawn de `Code.exe`. v1: spawn del `.exe` con ruta absoluta, el mismo argv que pruebas a mano contra ese exe.

Iconos v1: mapa extensión → SVG/PNG empaquetado. Cero permiso extra, igual en todas las máquinas. Icono nativo del SO = adaptador después, si el mapa se siente falso.

El kit no se llama `paravel-launch`. Es `launch-host`. Paravel lo consume.

---

## Qué NO hace este kit

No es Paravel (espacios, CTO, grupos).  
No lee el cerebro de Firefox.  
No extrae iconos en el browser.  
No es un marketplace de conectores.

Cuando estas cuatro operaciones (carpeta en el editor, URLs en Firefox, archivo/explorador, icono) estén redondas y se vean en el log, recién se enchufan como **Iniciar** de una pieza en Paravel.

---

## Orden de prueba (auditable)

1. Desde terminal: `code --new-window <carpeta>` y `firefox --new-window <url> <url>`.
2. El host, a palo, mismo argv; el log debe coincidir carácter a carácter.
3. React solo dispara el JSON; con el host apagado, la UI enseña “host no disponible”, no intenta shell.
4. Un path fuera de la allowlist: rechazo en log, cero proceso.

Si el paso 2 no replica el 1, el adaptador está mal. No se sigue a Paravel.
