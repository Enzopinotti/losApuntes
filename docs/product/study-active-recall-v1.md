# Bloque 42 — Práctica activa por materia

**Estado:** implementación Web propuesta en PR. No reemplaza evidencia de browser/API e2e.  
**Base:** Mesa de estudio B40, planificador de sesiones B41, APIs Q&A existentes.

## Objetivo de producto

Permitir practicar la explicación de una pregunta antes de consultar lo que respondió la comunidad. Las respuestas publicadas, incluso las aceptadas por el autor, **no son soluciones verificadas por la plataforma**. Las marcas "Lo pude explicar" y "Necesito repasar" son autoevaluaciones privadas, nunca calificaciones ni reputación.

## Flujo funcional

1. Desde `/study` o `/study/session`, entrar en `/study/practice?subjectId=UUIDv4`. Ruta autenticada `PrivateRoute`.
2. Contexto `GET /discovery/contextual` con hasta 8 materias actuales. No se resuelve un Subject no incluido ni se interpreta como inactivo por estar fuera de la ventana.
3. `GET /questions?subjectId=...&limit=25`, con paginación explícita. El usuario selecciona hasta **10** preguntas (o una ronda rápida con las primeras 5 visibles). La cantidad visible no pretende ser el total.
4. Cada pregunta activa se consulta de nuevo con `GET /questions/:id`. Solo se muestra su cuerpo si la autoridad confirma que pertenece al Subject seleccionado y está disponible.
5. El usuario escribe su intento (máximo 1000 caracteres; **solo memoria en la pestaña**). Las respuestas retornadas por la API **permanecen ocultas** hasta la acción expresa "Mostrar respuestas de la comunidad".
6. Una vez reveladas, se muestra el conjunto retornado y, si hay más páginas, se solicitan con `GET /questions/:id/answers?cursor=...`. Se distingue una respuesta "aceptada por quien preguntó" de una respuesta oficial; si la aceptada no está en la página, no se la inventa.
7. Después de comparar, el usuario puede marcar "Necesito repasar" o "Lo pude explicar". Puede dejar sin clasificar, volver a una pregunta anterior y consultar el resumen autodeclarado.
8. Exportación con `recallToStudySession` crea un JSON **compatible con StudySession v1**: solo `subjectId` e IDs UUIDv4 de las preguntas marcadas como "Necesito repasar", 20 minutos por actividad, sin títulos, cuerpos, respuestas, autores ni notas de intento.
9. Al importar ese plan en `/study/session`, el planificador vuelve a comprobar cada Question por API y aclara los fallos. El export no es un grant.

## Privacidad / seguridad / accesibilidad

- No hay Mongo, nuevo endpoint, localStorage, sessionStorage, IndexedDB, cookies propias, métricas de engagement ni persistencia oculta.
- Contexto, selección, ronda, intentos, respuestas mostradas y estadísticas se **recortan por `status,user,session,subject`** en cada render; los requests usan `useAsyncAuthorityFence` con AbortSignal.
- Cambios rápidos entre preguntas o materias no reutilizan cuerpo ni respuestas de una clave anterior.
- Un recurso retirado/moderado genera un error de carga, permite reintento u omisión sin autoevaluación ficticia.
- Consulta de respuestas a posteriori: navegar por páginas puede cambiar qué respuestas están disponibles; la UI no afirma completitud.
- Controles `aria-pressed`, foco visible, `aria-live`, `role=alert`, navegación de teclado y composición responsive.
- No hay puntuación automática, streak, recompensas ni presión por actividad continua.

## Aceptación pendiente

| Caso | Verificación |
| --- | --- |
| 1 | Ruta privada / anonimato o auth restaurando |
| 2 | Subject inválido, repetido o ausente del contexto |
| 3 | Selección duplicada / más de 10 / ronda rápida acotada |
| 4 | Cambio de cuenta/sesión durante búsquedas |
| 5 | Cambio rápido de pregunta con respuesta anterior en vuelo |
| 6 | Pregunta revocada/moderada al iniciar la ronda |
| 7 | Enunciado y respuestas ocultas antes de revelar |
| 8 | Más páginas de respuestas, acceptedAnswerId ausente de la primera página |
| 9 | Error de red en preguntas y respuestas, recuperación |
| 10 | Nota de intento limitada a 1000 y no persistida |
| 11 | Autoevaluación explícita y estados sin clasificar |
| 12 | JSON sin metadatos de terceros, consumible por Session v1 |
| 13 | Importación de ese JSON revalida permisos de Q&A |
| 14 | Teclado, foco, tamaños móviles, respuesta larga, autor anónimo |
| 15 | Formato/prettier, TS, lint, Web build, browser E2E, QA runtime SHA exacto |

**Scripts de contrato:** `node scripts/test-web-study-active-recall.mjs` y `node scripts/test-web-study-practice-integration.mjs`. El código no debe declararse listo para producción hasta ejecutar QA completo.
