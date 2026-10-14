# Bloque 27 — Continuidad contextual dentro del detalle de apuntes

**Fecha:** 2026-10-14  
**Rama:** `feat/resource-detail-session-related-study-20261014`  
**Estado del bloque:** candidato a integrar, pruebas escritas **NO ejecutadas**.  
**Trazabilidad:** RES-FR-008/009, MOB-FR-005/007/008, NFR-SEC-001.

## Problema y solución

Inicio dispone de «Abiertos recientemente» (bloque 25) y los prioriza por
materia actual (bloque 26). Sin embargo, al entrar al detalle de un apunte no
había un acceso contextual para continuar en otros apuntes de **la misma
materia**, ni una ruta directa a las preguntas de dicha materia.

El detalle autorizado incorpora el panel **«Seguí con esta materia»**.
Ofrece dos recorridos distintos:

1. **«Ver preguntas de esta materia»:** usa
   `savedSubjectQuestionsAction` y el UUID canónico de la proyección ya
   autorizada; navega a la ruta de preguntas existente. Seleccionar la ruta
   **no concede permiso para leer ni publicar**; el backend mantiene sus
   comprobaciones.
2. **«Volver al apunte»:** muestra hasta **tres** recursos de la misma materia
   abiertos anteriormente en esta sesión de la app. Mantiene orden MRU y
   excluye el apunte actual. Son recientes en esta sesión, **no** resultados
   globales similares ni una recomendación algorítmica.

Un estado vacío explica que todavía no hay otros apuntes recientes de esa
materia. Errores de red o de autorización se presentan por separado y
ofrecen reintentar; no se anuncian erróneamente como «sin apuntes».

## Flujo de autorización

`ResourceRelatedSessionPanel` se monta **solo dentro de
`DetailState` con resultado `ready`**, asociado a `authorityKey` activo
y al `ResourceView` de la API. Esto impide mostrar enlaces contextuales
basados únicamente en un ID pasado por navegación.

`ResourceRelatedSessionController` lee **únicamente IDs** del registro
efímero `SessionRecentResourceOpens` (bloque 25), que conserva hasta ocho
por usuario y sesión. Después:

- Descarta el ID del recurso actual y limita a **siete** verificaciones
  como máximo por apertura de detalle.
- Recupera por la API de recurso autenticada cada candidato. Verifica que
  el ID devuelto corresponda al solicitado.
- Comprueba `resource.academic.subject.id` contra el Subject del recurso
  actualmente abierto, nunca contra un título o nombre de materia.
- **Solo tras volver a autorizar** presenta el título de recursos cuya materia
  coincide; máximo tres, en orden de apertura reciente.
- Los recursos 403/404 se ocultan y su ID se purga solo cuando la operación
  y la autoridad siguen vigentes. Errores offline/timeout no purgan IDs:
  se anuncian y se puede reintentar.
- La generación de petición, su `AbortController`, el foco, AppState,
  el recurso y la sesión impiden pintar resultados de otra cuenta,
  otro apunte o peticiones que llegaron después de salir del detalle.
- Pulsar un relacionado vuelve a abrir su detalle por la ruta ya existente,
  donde el servidor **revalida permisos otra vez**.

**No** se guardan títulos, descripciones, URLs firmadas, PDF, tiempos de
estudio ni listas de relaciones en disco, SQL/Mongo, analytics o red.
No se agrega endpoint, permiso de publicación, esquema, índice,
migración ni permiso móvil.

## Límites y decisiones de producto

- El contenido del panel está acotado a recursos efectivamente abiertos
  durante la sesión actual. Un apunte relacionado que nunca se abrió
  **no aparece**. No se afirma similitud semántica ni búsqueda global.
- El registro guarda hasta ocho IDs; la consulta realiza como máximo
  siete GET autenticados, además de la consulta normal del recurso actual.
  No se ejecutan solicitudes al perder foco ni en segundo plano.
- Esta estrategia prioriza seguridad y reutilización del contrato existente;
  el tráfico concurrente, latencia y batería deben medirse en QA nativa.
  Un futuro catálogo global de relacionados debería diseñarse con su
  endpoint autorizado y límites de paginación explícitos.
- No se crean snapshots inmutables ni historial multidispositivo.
  Una revocación posterior a la respuesta podría afectar lo ya renderizado;
  el detalle de destino vuelve a verificar el acceso.

## Matriz de aceptación pendiente

| Escenario | Resultado esperado |
| --- | --- |
| Entrar a un recurso autorizado | Panel de materia disponible |
| Detalle 401/403/404 | Sin panel de relacionados |
| Ningún otro apunte abierto en sesión | Estado vacío sin inventar contenido |
| Otros apuntes de otra materia | Se excluyen sin mostrar metadata |
| Apuntes de la materia actual, ya abiertos | Hasta tres, orden MRU |
| Ocho IDs recientes | Hasta siete verificaciones adicionales |
| Recurso relacionado revocado o borrado | No se muestra, su ID se elimina |
| Error offline parcial | Muestra solo autorizados, aviso y reintento |
| Todos los candidatos fallan | Estado de error, no un vacío engañoso |
| API devuelve ID distinto al solicitado | No muestra esa proyección |
| Salir del detalle en plena consulta | Abort y descarte de respuestas |
| Cambio de cuenta o sesión | No cruza IDs ni metadata |
| Volver a abrir un relacionado | Nueva autorización del detalle |
| CTA «Ver preguntas» | Ruta de Subject UUID canónico |
| Publicar pregunta | Permisos académicos siguen siendo del servidor |
| TalkBack y VoiceOver | CTA, estado vacío y reintento accesibles |
| Carga y latencia | Medir red, requests y batería en dispositivos |

## Pruebas escritas, no ejecutadas

`apps/mobile/test/resource-related-session-study.test.ts` cubre:
correspondencia de Subject/ID, límite y orden MRU, aislamiento del
recurso actual, 403/404 y purga segura, errores parciales, timeout total,
rechazo de respuesta con ID inesperado, cancelación al cambiar cuenta o
detalle, ruta académica y montaje únicamente bajo `DetailState` autorizado.

**Política:** commits atómicos `[skip ci]`; PR con **merge commit sin
squash** hacia `main`. Se difieren CI, tests, lint, typecheck, build,
benchmarks y QA de Android/iOS hasta validación acumulada. Estado final
del bloque: **integrado / NO validado** hasta verificar el SHA exacto.
