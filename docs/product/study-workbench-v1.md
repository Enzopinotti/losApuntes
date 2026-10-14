# Mesa de estudio por materia — Bloque 40

**Estado:** implementación propuesta en PR dedicado, no validada.  
**Base técnica:** main@c9d9055b8e579954448071b8cad58e88c24bedf9.  
**Dependencias:** ACAD-FR-005/006, SEARCH-FR-002/004, RES-FR-006/008/009, QA-FR-001, HOME-FR-001, NFR-SEC-001, NFR-UX-001 y NFR-REL-001. No reinterpreta el backlog como nueva autoridad.

## Objetivo de producto

Dar al estudiante un espacio contextual de trabajo por materia, separado de las tandas de feed. Reunir en una misma pantalla lo que ya eligió guardar, los apuntes que puede descubrir y las preguntas académicas abiertas.

**No es** un sistema de calificaciones, un algoritmo de productividad, una agenda de exámenes, una cuenta de estudio privada nueva ni una vía de acceso a bytes.

## Capacidades observables

1. Ruta autenticada `/study` accesible desde navegación.
2. Descubrimiento contextual con `GET /discovery/contextual`; se muestran hasta 8 materias corrientes por contrato backend.
3. Selección de materia mediante `?subjectId=UUIDv4`, validada de manera estricta; URL repetida/malformada no inicia búsquedas ni amplía el alcance.
4. Tres superficies separadas con resultados de autoridad backend:
   - Guardados personales: `GET /resources/saved/search?subjectId=...&order=saved`.
   - Recursos permitidos: `GET /resources?subjectId=...`.
   - Preguntas abiertas: `GET /questions?subjectId=...&status=open`.
5. Guardar y quitar guardados desde la Mesa mediante `PUT/DELETE /resources/:id/save`, sin crear grants. El mensaje de éxito aparece únicamente tras ACK; una respuesta ambigua exige verificar.
6. Paginación bounded por superficie. Fallas parciales mantienen otras superficies independientes.
7. Navegación a detalle de recurso, detalle de pregunta, biblioteca, Q&A, trayectoria y enlace de materia (sujeto a que el receptor también posea contexto válido).
8. Cambio de Account/sesión/Subject invalida solicitudes anteriores y oculta inmediatamente sus resultados.

## Reglas de seguridad / privacidad

- Search contextual no concede enrollment, Resource access ni participación; los dominios de destino siguen decidiendo sus permisos.
- Guardados y contexto no se conservan en localStorage. No se persisten tokens, PDFs, IDs de sesión, consultas, signed GET ni respuestas HTTP.
- Una materia excluida de la primera página del contextual no se reporta como borrada o inválida; el usuario puede revisar su trayectoria.
- El servidor puede revocar acceso a un Resource aunque siga guardado; el estado visible se debe refrescar.
- Ningún panel promete tener el conjunto completo de recursos o preguntas; se muestran páginas acotadas.
- No se añaden métricas nuevas de engagement ni se optimiza permanencia.

## Matriz de aceptación / QA pendiente

| Caso | Comportamiento requerido |
| --- | --- |
| 1. Auth restaurando | No consultar Resource/Search/Q&A prematuramente |
| 2. Sin materias actuales | Empty state real, sin materias inferidas |
| 3. `subjectId` malformado/repetido | Estado inválido, sin peticiones académicas |
| 4. Materia no en first-page de contextual | Estado no disponible, nunca buscar otra automáticamente |
| 5. Cambio rápido de Subject | No aparecen páginas/respuestas de Subject anterior |
| 6. Cambio de Account o revocación | No aparecen guardados privados anteriores |
| 7. Guardado existente | PUT idempotente, confirmación sólo después de ACK |
| 8. PUT timeout posiblemente aplicado | Sin éxito falso; mensaje para verificar Guardados |
| 9. DELETE timeout | No afirmar remoción; refrescar listado |
| 10. Doble clic Guardar | Una mutación activa por scope |
| 11. Pérdida de permiso | Fallo seguro o ausencia en read de Resource |
| 12. Error en Q&A | Guardados y recursos siguen operativos |
| 13. Error en Search | Q&A y guardados siguen operativos |
| 14. Cursor saved stale | Se informa cambio y se puede recargar primera página |
| 15. Botones paginar | Respetan el cursor y límites del servidor |
| 16. A11y | Foco, etiquetas, estados aria-live, teclado y targets |
| 17. Desktop/mobile Web | Vista responsive sin overflow no intencional |
| 18. Release | Test real de API, Web build, runtime smoke y QA manual sobre SHA candidato |

## Evidencia y alcance

`node scripts/test-web-study-workbench.mjs` cubre parse y resolución de contextos; no sustituye browser E2E ni runtime. La ruta y los requests requieren build/typecheck, pruebas negativas y smoke exact-head antes de pasar a VALIDADO.

Este bloque no depende de `feat/study-collections-v1-20261014`/PR #316, por lo que puede entrar a main sin esperar la solución de exportación/offboarding de esa nueva persistencia. Integrar Colecciones personales como cuarta columna requiere otro carrier cuando #316 cierre.
