# B184 — Reenvío seguro y comprensible del correo de verificación

**Fecha:** 21 de octubre de 2026. **Base:** `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`. **Alcance:** pantalla Web pública `/verify-email/pending`. Sin endpoints nuevos.

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
- CI exact-head con Node24, pnpm9 frozen, Web types, ESLint, Prettier, Chromium y producción Vite. Las pruebas se integran al `pnpm test` raíz.
- El test con respuestas simuladas comprueba el contrato del cliente y no reemplaza un smoke real de correo o la verificación de límites de tasa en la API.

## Release

B184 no modifica dependencias ni excepciones de auditoría. Los avisos de `node-forge` #133 y `braces` #141 siguen pendientes de un parche upstream confirmado. El parche de `follow-redirects` está separado en #495. La release #353 está **HOLD**: esta mejora de UX no habilita merge ni despliegue mientras el `pnpm audit --prod --audit-level high` global falle y los demás gates exact-head no estén completos.
