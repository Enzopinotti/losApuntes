# Mobile — Guardados → Preguntas de la materia (bloque 16)

**Estado:** implementado en rama candidata; integración solicitada sin CI.  
**Requisitos reutilizados:** `RES-FR-009`, `QA-FR-001/002/003`,
`MOB-FR-005/007/008`, `ACAD-FR-006`, `NFR-SEC-001`.
No se introduce un requisito funcional distinto del recorrido ya autorizado.

## Problema y experiencia

En Guardados el estudiante podía volver a abrir un apunte, filtrarlo o quitarlo,
pero no conectar ese material con las dudas y respuestas de la misma materia.
Ahora cada fila con un Subject canónico válido ofrece una acción independiente
**Preguntas de la materia**:

`Perfil → Guardados → apunte guardado → Preguntas de la materia → pregunta`.

Este acceso también funciona cuando la persona no cursa actualmente esa
materia: la **lectura** depende de los permisos de Q&A, y el botón para
**publicar** sólo aparece cuando el backend y la participación actual
revalidada coinciden con el Subject solicitado.

La acción existente «Abrir recurso» sigue navegando al detalle con el estado
guardado, y «Quitar de guardados» sigue siendo una mutación independiente.
No se confunden los tres controles ni se introduce guardado automático.

## Seguridad y técnica

- `savedSubjectQuestionsAction` deriva el enlace únicamente del Subject
  proyectado por el backend y valida el ID mediante
  `subjectQuestionsRouteId`, la misma política de UUIDv4 de la pantalla
  de Q&A. Si el ID no es válido, se omite la acción.
- Reutiliza `/questions/subjects/[subjectId]` y su feed paginado,
  comprobación de sesión, contexto, permisos y manejo de respuestas stale.
- No se agrega un endpoint, inscripción académica, permiso por posesión del
  Resource, caché local, metric/evento nuevo ni regla social duplicada.
- El botón «Volver» de la pantalla de preguntas deja de afirmar «Volver a
  Buscar», porque ahora se puede llegar desde varias superficies. Continúa
  ejecutando `router.back()`.

## Escenarios de aceptación

| Caso | Resultado esperado |
| --- | --- |
| Apunte accesible con Subject UUIDv4 | Acción Q&A visible, abre preguntas filtradas |
| Subject ausente/malformado/inyección | No se construye el enlace |
| Usuario con materia actual coincidente | Puede ver CTA para crear pregunta |
| Materia ajena o histórica | Puede consultar contenido permitido, no obtener permisos de publicación |
| Pérdida de sesión/cambio de contexto | Q&A revalida y no reutiliza permisos viejos |
| Recurso ocultado después de Guardados | La apertura del recurso reautoriza como antes |
| Quitar de guardados | Sigue siendo acción separada; no elimina preguntas |
| Llegada a Q&A desde Guardados o Buscar | «Volver» retorna a la pantalla anterior |

Se agregan pruebas en `apps/mobile/test/saved-subject-questions-action.test.ts`.
**No ejecutadas:** tests, lint, typecheck, compilaciones, CI y pruebas nativas.
Antes del cierre validado se requieren pruebas contra el SHA real de main,
navegación Android/iOS, TalkBack/VoiceOver, cambio de cuenta, pérdida de acceso
y verificación de publicación únicamente con contexto elegible.

**Límite de estado:** merge a main con `[skip ci]` significa *integrado*,
no *validado* ni *apto para lanzamiento*.
