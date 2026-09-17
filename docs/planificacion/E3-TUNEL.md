# E.3 Túnel temporal hacia Grok

Operación del puente experimental. No versiona URLs ni secretos. No cierra 4.9. Contrato: [EXPERIMENTO-GROK-TUNEL.md](./EXPERIMENTO-GROK-TUNEL.md) §10 · adaptador: [E2-ADAPTADOR-HTTP.md](./E2-ADAPTADOR-HTTP.md).

## Proveedor

**Cloudflare quick tunnel** (`cloudflared`). Documentado por xAI para Streamable HTTP. Sin cuenta. La URL cambia al reiniciar: hay que re-registrar el conector en Grok. TLS lo termina Cloudflare; eso no sustituye OAuth.

ngrok queda de reserva si el transporte fallara. Su panel de inspección registra tráfico: no usarlo como primera opción.

El túnel apunta **solo** a `127.0.0.1:PUERTO` del adaptador. No publicar Tauri, WebView2, SQLite ni otros puertos.

## Mesa sintética (obligatoria en la primera conexión)

En Paravel, crear un espacio de prueba (nombre claro, p. ej. `Mesa túnel Grok`). Nota y piezas **sintéticas**, sin secretos, sin paths reales de trabajo. Guardar el pack (`set_invite`) con las piezas que Grok puede leer. Anotar el UUID del espacio (invoke `list_spaces` o consulta SQLite de solo lectura). Obtener la ruta de la DB con `db_path`.

No usar una mesa con datos reales hasta revisar su nota y payloads.

## Frase de operador

Crear un archivo **fuera del repo**, un renglón ASCII de ≥16 caracteres. Ejemplo de nombre: `%USERPROFILE%\paravel-http.operator-secret`. No commitearlo. El crate ignora `*.operator-secret`.

## Arrancar (orden fijo)

En una terminal, desde la raíz del repo, con el exe ya compilado:

```powershell
$secret = "$env:USERPROFILE\paravel-http.operator-secret"
$db = "RUTA_ABSOLUTA_DE_paravel.sqlite3"
$espacio = "UUID_DE_LA_MESA_SINTETICA"

& ".\app\crates\paravel-mcp\target\release\paravel-mcp.exe" `
  --db $db `
  --espacio $espacio `
  --http 127.0.0.1:8787 `
  --public-url http://127.0.0.1:8787 `
  --operator-secret-file $secret
```

El proceso escribe `HTTP_BIND` y `HTTP_PUBLIC_URL` en stderr. stdout debe quedar vacío. `--http` sin el archivo de frase se rechaza (exit 2).

En **otra** terminal:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

Copiar la URL `https://*.trycloudflare.com` (sin path). **Parar el adaptador (Ctrl+C), no el túnel primero**, y relanzarlo con esa URL pública:

```powershell
& ".\app\crates\paravel-mcp\target\release\paravel-mcp.exe" `
  --db $db `
  --espacio $espacio `
  --http 127.0.0.1:8787 `
  --public-url "https://XXXXXXXX.trycloudflare.com" `
  --operator-secret-file $secret
```

`--public-url` es el issuer OAuth que Grok descubre. Si no coincide con la URL del túnel, el consentimiento falla. Relanzar el túnel sin actualizar `--public-url` y el conector es un error de operación, no de código.

Volver a levantar `cloudflared` contra el mismo puerto.

## Conector en Grok (E.4, acción humana)

1. grok.com/connectors → New Connector → Custom.
2. Server URL: `https://XXXXXXXX.trycloudflare.com/mcp` (con `/mcp`, sin slash final extra).
3. Completar OAuth. Si pide Client ID/Secret a mano: Secret vacío; los endpoints están en `/.well-known/oauth-authorization-server`. DCR debería registrar solo.
4. En el navegador de consentimiento: comprobar que el destino es `grok.com` o `x.ai`. Pegar la frase de operador. Confirmar.
5. `tools/list` debe mostrar exactamente `leer_espacio`, `listar_piezas`, `leer_contexto_pieza`.

No pegar la frase ni la URL del túnel en el repositorio ni en transcripts públicos.

## Parar y revocar

1. En Grok: quitar o desconectar el conector.
2. Ctrl+C en `cloudflared`.
3. Ctrl+C en `paravel-mcp`.
4. Los tokens viven solo en memoria: el proceso muerto no sirve credenciales. Cambiar la frase de operador antes de un nuevo arranque si se sospecha filtración.
5. No hay servicio Windows ni restart automático.

Apagar o suspender el equipo local corta el puente. Una URL difícil de adivinar no es autenticación.

## Límites registrados

| Límite | Valor |
| --- | --- |
| Bind | `127.0.0.1` únicamente |
| Cuerpo | 64 KiB → 413 |
| MCP concurrentes | 4 → 429 |
| Cadencia por access token | 60/min → 429 |
| Cadencia pública (metadata/DCR/authorize/token) | 60/min compartida → 429 |
| Respuesta MCP | 256 KiB (contrato stdio) |

## Qué no hacer

- Abrir el túnel contra un adaptador **sin** OAuth o sin `--operator-secret-file`.
- Usar `--public-url http://127.0.0.1` hacia Grok (Grok exige HTTPS público).
- Exponer `0.0.0.0`, el puerto de Tauri o la SQLite.
- Afirmar que 4.9 está cerrado por arrancar el túnel.
