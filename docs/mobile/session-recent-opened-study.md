# Bloque 25 — Apuntes abiertos recientemente (solo sesión)

**Fecha:** 14 de octubre de 2026  
**Carril:** `feat/mobile-session-recent-opens-20261014`  
**Requisitos vinculados:** MOB-FR-001/005/007/008, RES-FR-008/009, NFR-SEC-001.  
**Estado de calidad:** implementación candidata; tests y dispositivos **sin ejecutar**.

## Qué aporta y qué evita duplicar

Inicio ya tenía **Retomá tus guardados**, un preview autorizado de los
guardados más recientes **por fecha de guardado**. No había tracking de
apertura de apuntes ni una fuente fiable de progreso de lectura.

El nuevo bloque incorpora una tarjeta **Abiertos recientemente** que presenta
hasta cuatro apuntes cuyos **detalles** se abrieron con éxito durante la
sesión actual de la aplicación. Es una ayuda de navegación diferente del
listado de guardados, y no requiere guardar el apunte previamente.

No se denomina «últimos leídos», «tiempo de estudio», «seguir donde lo
dejaste» ni «progreso». El sistema **no sabe** si el estudiante abrió el PDF
ni conoce página o porcentaje de lectura. Tampoco se inventan eventos de
lectura sobre el backend.

## Almacenamiento y retención

`SessionRecentResourceOpens` conserva **como máximo ocho IDs de recursos**
en memoria del proceso JS y nunca persiste datos en AsyncStorage, SQLite,
SecureStore, archivos, Mongo o analytics.

- No se guardan títulos, nombres de materias, credenciales, vínculos a PDF,
  URLs firmadas, fecha ni duración de lectura.
- El historial es independiente del contenido guardado en servidor.
- Volver a abrir un ID lo mueve al principio y no lo duplica.
- Se separa por identidad **usuario + sesión**; cambiar identidad reinicia
  el registro anterior. El contexto académico de Inicio es independiente
  de la identidad de la sesión.
- Salir de la app o reiniciar el proceso pierde el historial. Volver del
  background a la misma sesión no lo borra.
- «Limpiar recientes de esta sesión» elimina solo estos IDs; no modifica
  guardados ni contenido remoto.

## Seguridad y navegación

`MobileResourceDetailsScreen` registra el ID únicamente después de recibir
una respuesta **ready** de `useFencedDetail`, con comprobación del
`authorityKey` activo y coincidencia exacta de `resource.id`.

Al volver a Inicio, `HomeRecentOpenedController` recupera como máximo ocho
IDs de memoria y realiza `ResourceConsumptionApi.resource` autenticado
**para cada uno**, con `AbortController` y generación de autoridad.

- No se renderiza ningún título guardado en memoria: toda la información
  visible viene de una respuesta de recurso recién autorizada.
- Una respuesta 404 o 403 por recurso revocado se omite, y su ID se elimina
  del registro solo si todavía corresponde a la sesión.
- Fallos transitorios (sin red, timeout o restricción) **no** vacían el
  historial; se muestran como error o verificación parcial y ofrecen reintento.
- Si devuelve un ID distinto del solicitado, se rechaza la respuesta.
- Si cambia sesión, usuario, contexto, foco o AppState, se abortan solicitudes
  y se descartan proyecciones tardías. No se expone metadata de otra cuenta.
- Al pulsar un apunte se vuelve al detalle existente que revalida permisos;
  no se reusa un enlace firmado anterior.

## Costos y limitaciones

El listado de hasta ocho IDs requiere **hasta ocho GET autenticados** al
abrir Inicio desde la navegación. Es un costo de red acotado, pero quedan
pendientes las mediciones de latencia y el impacto de la concurrencia en
dispositivos. Este bloque no introduce endpoints de batch ni índices Mongo.

Es **continuidad local de navegación durante una sesión**, no sincronización
entre dispositivos. Para historial real multidispositivo haría falta un
modelo explícito de consentimiento, retención, privacidad, event sourcing
o almacenamiento por usuario y un contrato de lectura autorizado.

El preview se monta junto a «Retomá tus guardados», sin sustituirlo ni
modificar la jerarquía del feed, la paginación de Inicio o el algoritmo de
recomendaciones.

## Matriz de aceptación pendiente

| Escenario | Resultado esperado |
| --- | --- |
| Abrir detalle autorizado | ID añadido al frente del historial |
| Fallar por 401/403/404 al abrir detalle | No registra ID |
| Reabrir mismo ID | Lo mueve al frente sin duplicar |
| Abrir más de ocho IDs | Conserva ocho, muestra hasta cuatro |
| Reingresar a Inicio | Reconsulta permisos/metadata antes de mostrar |
| Recurso ahora privado o eliminado | No muestra su título; purga ID |
| Red desconectada | Error, no vacío engañoso, IDs conservados |
| Error parcial de un recurso | Muestra autorizados y advierte verificación parcial |
| Respuesta con ID distinto | No la presenta como autorizada |
| Cambio de cuenta o nueva sesión | No comparte IDs ni respuestas |
| Cambio de contexto académico | Conserva IDs de sesión pero reautoriza en Inicio |
| Foco perdido/background | Ninguna proyección antigua queda visible |
| Limpiar recientes | Solo IDs locales; no modifica guardados |
| Finalizar proceso de app | Historial vacío en nuevo proceso |
| VoiceOver/TalkBack | Etiquetas claras, reintento y acceso a detalle |
| QA de carga | Verificar hasta ocho GET por carga y su latencia |

## Tests y validación

Pruebas escritas **sin ejecutar** en
`apps/mobile/test/home-recent-opened.test.ts` para: orden/MRU,
límites y deduplicación, memoria y aislamiento de sesión, validación de
cada recurso, 403/404, red y timeout, fallas parciales, rechazo de ID
incorrecto, cancelación ante autoridad cambiada, limpieza local, y wiring
de Inicio y Detalle.

**Política del desarrollo acelerado:** PR con commits atómicos `[skip ci]`;
integración por **merge commit sin squash**, sin CI, typecheck, lint, builds,
tests, QA Android/iOS ni release en este bloque. Solo el gate conjunto con
el SHA real de `main` podrá marcar la funcionalidad como **VALIDADA**.
