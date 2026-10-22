# B184 — Reenvío seguro y comprensible del correo de verificación

**Fecha:** 22 de octubre de 2026. **Base actual del carrier:** `main@f416172ca3e55e17c764bc3fd77fea77d99fedf6`. **Alcance:** pantalla Web pública `/verify-email/pending`. Sin endpoints nuevos.

El PR #520 se creó sobre una base anterior e incluía un workflow dedicado. Este carrier se reconstruyó sobre `main` actual, conserva sus commits funcionales, pruebas y documentación, y excluye el commit de workflow. No modifica workflows ni protecciones.

## Problema y experiencia

La pantalla ofrecía un botón de reenvío de verificación sin un intervalo de espera visible y dependía únicamente de `setSending` para evitar dobles pulsaciones. Dos submits ejecutados en el mismo tick podían emitir dos solicitudes antes de que React actualizara el botón, mientras que un usuario no distinguía la aceptación de una solicitud de la llegada real del correo.

B184 incorpora un control local reversible y acotado que **no constituye protección contra abuso del servidor**:

1. El usuario escribe o corrige un correo. No se envía ninguna solicitud automáticamente al montar la ruta.
2. Al pulsar «Reenviar email», se usa el endpoint existente `POST /auth/email-verification/request`. Una referencia síncrona impide un segundo POST mientras el primero está pendiente, aunque se dispare un segundo submit programático.
3. Solo cuando el servidor responde aceptando, comienza una **espera local de 60 segundos para esa dirección**. Un mensaje visible informa cuándo se puede volver a solicitar; el botón permanece desactivado durante la espera.
4. Se conserva un historial **en memoria** de hasta ocho direcciones usadas durante esta visita para que corregir el correo y volver a una dirección anterior no anule accidentalmente su intervalo.
5. Si el usuario corrige el correo a una dirección distinta, puede enviar una solicitud para esa dirección. El backend sigue teniendo la responsabilidad de limitar solicitudes de forma global y por IP/cuenta/destino.
6. El temporizador usa `performance.now()` (reloj monótono) en lugar de contar intervalos: no acumula segundos por `setInterval` y se reconcilia al volver a enfocar la ventana o abrir la pestaña.
7. Un error HTTP (incluido `RATE_LIMITED`) **no inicia una espera de éxito falsa**. Se muestra el texto seguro existente de `authErrorMessage` y el ID de solicitud cuando corresponde, sin inventar un `Retry-After` que el contrato no entregue.
8. Si la dirección cambia mientras está pendiente una respuesta, esa respuesta no muestra un mensaje de éxito/error asociado a otra dirección. Al desmontar el componente, no se sigue actualizando su estado.
9. No persiste correos, tiempos, estados ni eventos en localStorage, sessionStorage, cookies, telemetría o backend. Recargar elimina la espera local; los límites reales del backend deben continuar vigentes.

## Contratos e invariantes

- `verification-resend-safety.mjs` contiene la normalización acotada del identificador del correo, el cálculo de plazo tras aceptación real y la guarda de envío. No realiza ninguna operación de red o reloj por sí mismo.
- La pantalla conserva el texto genérico «Si podemos continuar con esa dirección...» en lugar de confirmar si existe una cuenta para el correo.
- `inFlight.current` es síncrono para evitar dobles envíos durante el intervalo previo al render. `sending` sigue aportando accesibilidad y estado visual; no se trata de una mutex distribuida.
- La espera no es una promesa de entrega, un estado del SMTP, ni un token de autorización. El backend es la autoridad para emisión de correo, enumeración, throttling y seguridad.
- No se modifica `authService`, el contrato de autenticación, CORS, tokens, sesión, Docker ni las rutas privadas.

## Aceptación automatizada

- Diez pruebas deterministas: plazo de 60 segundos, correo corregido, doble submit, error sin bloqueo ficticio, normalización y datos de navegación malformados, tiempo monótono, registro inválido, desmontaje/timers, neutralidad frente a enumeración y endpoint único.
- Chromium real con Vite/loopback: no envío en mount, dos submits síncronos producen un solo POST, contador con espera, reenvío a otra dirección, regreso a la dirección original, avance del reloj virtual, respuesta 429 sin plazo de éxito y recarga sin persistencia.
- Las pruebas se integran al `pnpm test` raíz. Validación local del carrier: frozen install, 10/10 pruebas deterministas, Chromium real, tipos, ESLint, Prettier, build Vite y diff limpio.
- No se ejecutó CI desde este carril. GitHub puede iniciar automáticamente sus checks existentes al actualizar o abrir la PR.
- El test con respuestas simuladas comprueba el contrato del cliente y no reemplaza un smoke real de correo o la verificación de límites de tasa en la API.

## Validación local

- `corepack pnpm install --frozen-lockfile --filter los-apuntes --filter @losapuntes/web...` — PASS.
- `corepack pnpm test:web-verification-resend-b184` — PASS, 10/10.
- `node scripts/test-web-verification-resend-b184-browser.mjs` — PASS, duplicación, esperas, corrección de dirección, HTTP 429 y recarga en Chromium loopback.
- `corepack pnpm --filter @losapuntes/web check:types`, `lint`, `format:check` y `build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.
- `corepack pnpm audit --prod --audit-level high` — FAIL con 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; no reporta `follow-redirects`. Sin waiver.

## Release

B184 no modifica dependencias ni excepciones de auditoría. El audit productivo actual sigue en rojo por 2 HIGH (`node-forge` #133 y `braces` #141) y 3 MODERATE; `follow-redirects` se corrigió en B190/#543. Esta mejora no modifica controles del servidor ni autoriza una release. La release #353 permanece **HOLD** hasta cerrar sus gates de seguridad y aceptación.
