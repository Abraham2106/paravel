# Paravel (app)

App de escritorio Tauri v2 + React. React solo llama `invoke()`; Rust resuelve los `.exe`, valida y escribe un log append-only.

La guía pública del repositorio está en el [README raíz](../README.md). El crate nativo sigue llamándose `launch-host`.

## Desarrollo

```powershell
cd app
npm install
npm run tauri dev
```

El log queda junto a la SQLite, en la carpeta de datos de este equipo (`launch.log`). Carpetas extra y rutas de programas se configuran en **Este equipo**, no en variables de entorno.

## Reproducir un argv (criterio 2.9)

Cada resultado exitoso muestra el `argv` exacto y su `request_id`. El primer renglón es la ruta absoluta al `.exe`; cópialo como un comando de PowerShell junto con los renglones siguientes, por ejemplo:

```powershell
& 'C:\Users\...\Code.exe' --new-window 'C:\Users\...\carpeta'
& 'C:\Program Files\Mozilla Firefox\firefox.exe' --new-window https://example.com https://www.mozilla.org
```

Debe producir la misma ventana que el botón. Si el `.exe` no existe, el host devuelve un error claro y no intenta usar `PATH`, `code`, `code.cmd`, `.bat` ni un shell.

## Grupos de Firefox

En un espacio, usa **Agregar → Grupo de Firefox**. Pega un nombre en la primera
línea y una URL por línea, o escribe el nombre en su campo separado. Se guarda
como una pieza `firefox-group` con `payload.urls`, sin modificar las piezas web existentes.
Al iniciar, todas sus páginas se abren juntas en una ventana de Firefox.
El nombre pertenece a Paravel: no crea marcadores ni un grupo de pestañas nativo
dentro del perfil de Firefox.

Acepta HTTP, HTTPS y archivos `file:///C:/…`. Las líneas inválidas impiden guardar
y muestran su número. Los archivos locales se comprueban al iniciar, con los
mismos límites de rutas que una pieza de archivo; si falta uno, el grupo no se abre.
Las pruebas no lanzan páginas ni modifican perfiles:

```powershell
node --experimental-strip-types --test scripts/firefox-group.test.mjs
cd src-tauri
cargo test --lib firefox_group
```

## Roots permitidos

Por defecto se permite el home del usuario y `%TEMP%\launch-host-test`. Para más carpetas, usa **Este equipo** en la app (queda en `settings.json` local). `LAUNCH_HOST_ALLOWED_ROOTS` sigue valiendo para harnesses.

Las piezas `file` usan el opener del sistema mediante `ShellExecuteW` tras canonicalize, root permitido y denylist de ejecutables/atajos/scripts. Su `argv` de log (`["ShellExecuteW", ruta]`) no es pegable como `Code.exe`.

## Plantillas de espacios (P03)

Desde un grupo, **Crear espacio** abre el asistente: vacío o Desarrollo / Investigación / Cliente. La preparación queda en la mesa, fuera de MCP. Pruebas con fixture sintética:

```powershell
cd app
node --test scripts/templates.test.mjs
cd src-tauri
cargo test --lib templates
```

El recorrido nativo (`node scripts/templates-native.test.mjs`) usa WebView2 real y no debe correr a la vez que otro harness CDP. No lanza aplicaciones.

## 2.9
`scripts/reproducir-argv.ps1` imprime el último `argv` como comando PowerShell copiable.
Usa `-RequestId <id>` para seleccionar otra entrada del log.
Por defecto solo imprime el comando y no lo ejecuta.
`-Run` está limitado a `Code.exe`, `Cursor.exe`, `firefox.exe` y `explorer.exe`.
Las entradas `ShellExecuteW` se reportan como opener del SO y nunca se ejecutan.
