# Mobile v1 — aceptación nativa del primer recorrido

Estado: **guía de ejecución pendiente**. Este archivo define cómo obtener evidencia de la issue [#7](https://github.com/Enzopinotti/losApuntes/issues/7); su existencia y los tests del repositorio **no constituyen aceptación en dispositivo**. El alcance se apoya en [#49](https://github.com/Enzopinotti/losApuntes/issues/49) para Google nativo y en `docs/mobile/auth-v1.md` para autenticación.

## Condiciones previas

- Instalar una **build nativa** identificable en Android e iOS, preferentemente dispositivo físico; informar por separado cualquier resultado de simulador. No usar Expo Go para acreditar SecureStore, Google o firma nativos.
- Registrar plataforma, modelo, versión de sistema, versión y build nativa de la app, distribución, **SHA completo** embebido en `EXPO_PUBLIC_RELEASE_SHA`, origen API y fecha. La observación real de `GET /health/release` debe proceder de ese origen; conservar únicamente `releaseId` y `sourceSha` públicos, sin datos privados. Si no hay release verificable, marcar **bloqueado**, no aprobado.
- Usar cuentas de prueba A y B y un catálogo académico de prueba con institución, carrera y materia permitidas. Disponer de un PDF pequeño no sensible, una conexión capaz de interrumpirse y un correo de prueba para verificar enlaces.
- No fotografiar ni adjuntar contraseñas, tokens de sesión, enlaces firmados, enlaces de recuperación, cookies, encabezados Authorization, ni archivos privados con datos reales.

## Matriz de recorrido por plataforma

Ejecutar cada punto **en Android e iOS**, registrando por separado `PASS`, `FAIL` o `BLOCKED`, SHA/build y una evidencia saneada que no contenga secretos.

| ID | Recorrido | Evidencia esperada |
| --- | --- | --- |
| N01 | Instalación limpia, registro, verificación de email y primer login | No requiere Web como alternativa; la sesión solo se habilita después de validación del backend. |
| N02 | Cierre, reapertura y vuelta de background con sesión vigente | Revalidación de sesión por backend, sin estado de otra cuenta ni recuperación insegura de credenciales. |
| N03 | Password recovery: enlace válido, inválido y vencido | Mensajes claros, token de un uso no expuesto en historial/capturas ni logs. |
| N04 | Google nativo cuando está configurado, y fallback cuando no lo está | Resultado real del proveedor, vinculación/desvinculación autorizada, sin perder el último método de acceso. Si faltan credenciales OAuth/dispositivo, **BLOCKED** y referencia a #49. |
| N05 | Selección y cambio de institución/carrera/materia | El backend confirma contexto y revisión; una respuesta tardía del contexto anterior no modifica la pantalla. |
| N06 | Búsqueda con contexto académico, abrir un PDF, guardar y desguardar | Resultados de servidor, acceso al archivo mediante autorización reciente y cambios de guardado confirmados; repetir con cierre/reapertura. |
| N07 | Subir PDF/JPG/PNG/WebP de prueba hasta el límite permitido | Intent → transferencia → finalización → creación, recurso inicialmente privado y asociado a materia válida; comprobar error para formatos/tamaños inválidos. |
| N08 | Interrumpir red/cambiar de contexto/cuenta durante subida | La subida cancelada no avanza a etapas posteriores; si la creación ya fue enviada, no reintentar a ciegas ante resultado incierto: verificar desde la cuenta autorizada si se creó. |
| N09 | Volver de background durante búsqueda, detalle de recurso y cambio de sesión A → B | No reaparecen resultados privados ni avisos exitosos pertenecientes a A. |
| N10 | Offline, timeout y 401/revocación durante restore y uso | Offline ≠ logout automático; 401 revoca la autoridad de sesión local; hay reintento y error comprensible. |
| N11 | Logout y acceso con la cuenta B | SecureStore invalida A; navegación, contenido privado y contexto de A no quedan disponibles para B. |
| N12 | Pantalla pequeña, teclado, VoiceOver/TalkBack y enlaces profundos | Controles accesibles, navegación de vuelta, foco y mensajes de error legibles, sin depender solo del color. |

## Protocolo para fallas de publicación

1. Una cancelación **antes** de la llamada `POST /resources` no debe iniciar esa creación, incluso cuando una transferencia, un intent o una finalización responda después de la cancelación. Los tests de `resource-upload-controller.test.ts` verifican este control dentro del cliente.
2. Una cancelación **después** de enviar `POST /resources` no prueba que el servidor haya revertido la operación. Mostrar estado **incierto**, evitar reintento duplicado y consultar el inventario autorizado antes de intentar publicar nuevamente.
3. Una pérdida de red tras la transferencia no debe filtrar URLs firmadas ni credenciales; los reintentos permitidos conservan las etapas confirmadas y la clave de operación mientras el contexto siga vigente.
4. La cancelación por cambio de sesión/contexto debe invalidar trabajo anterior; observar logs y estado del servidor **sin incluir identificadores privados o tokens** en el reporte.

## Evidencia y cierre

Para cada plataforma: registrar `N01…N12` con resultado, entorno, identidad de build/API, pasos exactos de reproducción para `FAIL`, referencia a un artefacto saneado y nombre del responsable. En casos no ejecutados, indicar `BLOCKED` con dependencia concreta; no tratar `BLOCKED` como `PASS`.

Guardar la evidencia vinculada al SHA exacto en el formato de `docs/operations/release-evidence.md` y referenciarla desde #7; los casos Google desde #49. Ante cambio de SHA nativo o entorno de backend, repetir los casos afectados. `pnpm check`, cobertura GitHub Actions y export Expo son **evidencia de repositorio**, no evidencia de instalación, firma, OAuth real ni dispositivo.

**Criterio de cierre de #7:** recorrido completo `N01, N02, N05, N06, N07, N08, N09, N10, N11, N12` con resultado aprobado en ambos sistemas soportados y evidencias revisadas. `N03` y `N04` deben documentarse; si un proveedor permanece no configurado, conservar bloqueo explícito de #49 y no declarar toda la autenticación nativa aceptada.
