# B141 Web — Cierre guiado de una ronda de práctica

**Base:** `main@5ae4da23532e28457ebf3c6e9fe8ff207279dedf` (B140 Web).
**Carril:** funcionalidad `StudyPractice` y modelos de Web; **independiente de PR #465**, denominado B141 pero dedicado al diagnóstico de auditoría de seguridad.

## Necesidad resuelta

Antes, el botón "Salir de la ronda" borraba las notas y marcas temporales después de un diálogo genérico, sin ayudar al estudiante a decidir qué continuar. Con este bloque, el estudiante abre primero **Revisar cierre de ronda**, con un resumen privado que diferencia las preguntas explícitamente explicadas, las marcadas para repasar y las todavía sin clasificar.

El panel de cierre sugiere el siguiente paso según las marcas existentes:

1. **Hay preguntas sin clasificar:** muestra cuántas faltan y permite ir directamente a la primera de ellas. Nunca presupone que una respuesta sin clasificación sea incorrecta.
2. **Todas están clasificadas y hay dudas:** permite revisar una pregunta marcada y ofrece guardar el plan de repaso por el mecanismo vigente, con la revalidación de acceso que ya exige el Planificador.
3. **Todas están clasificadas como «Lo pude explicar»:** permite terminar o guardar un resumen privado, sin inventar aprobaciones, notas ni métricas académicas.

Siempre están disponibles **Guardar resumen privado**, **Seguir practicando** y **Terminar y descartar notas temporales**. En este último caso aparece un diálogo de confirmación que aclara la pérdida de datos y, según el caso, advierte sobre preguntas todavía sin clasificar o dudas marcadas para repasar. No existe cierre automático al llegar a la última pregunta.

## Seguridad y consistencia

- `planRecallClosure(subjectId, ids, outcomes, minutes)` deriva solamente números, índices de la cola actual y tiempo de repaso elegido; rechaza IDs duplicados, outcomes ajenos/malformados, duración inválida y materia no válida. La salida no incluye UUIDs, preguntas, respuestas, notas escritas, calificaciones, usuarios, URLs ni timestamps.
- El panel se abre explícitamente y se vincula a `scope` (cuenta/sesión/materia/foco), `pass` y `activationId`. Si el estudiante cambia de contexto, inicia una ronda nueva, pausa o retoma, un cierre anterior no puede confirmar la ronda nueva.
- Al ir a una pregunta sugerida se verifica `pass` y que la cola siga siendo exactamente la vigente. El contenido se sigue consultando mediante `communityApi.question`, sujeto a `useAsyncAuthorityFence` y a la verificación de materia. Los índices no son permisos.
- El borrado final solo actúa en la ronda del mismo contexto, intento y lista. Si se cancela la confirmación, las respuestas y marcas quedan intactas.
- La descarga de resumen B137 y el pase a Planificador B135 reutilizan funciones existentes: **no** se envían notas a un servidor ni se agrega almacenamiento.
- La presentación es un panel con encabezado accesible, controles nativos y estilos responsivos. El color no codifica calificaciones.
- Los reintentos B134, la planificación B135, la pausa B136, el reporte B137, la navegación B138, la importación B139 y el orden B140 siguen vigentes.

## Pruebas y control de calidad

```sh
pnpm test:web-study-recall-closure
pnpm test:web-study-recall-order
pnpm test:web-study-review-plan-import
pnpm test:web-study-recall-pause
pnpm test:web-study-private-report
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El contrato B141 Web forma parte de `pnpm test` obligatorio y tiene workflow read-only del SHA exacto; para fusionar a `main` se requieren el Quality Gate completo, las 10 coberturas críticas y smoke de contenedores. Esta evidencia de regresión no reemplaza ensayos interactivos de accesibilidad ni pruebas de revocación de permisos en navegador.

**Release:** #353 **HOLD**, `STUDY_PROGRESS_ENABLED=false`. La auditoría de dependencias productivas permanece obligatoria y roja mientras #133/#141 de seguridad sigan pendientes. Esta funcionalidad no activa producción, no crea excepciones y no cambia dependencias, infraestructura, API ni BD.
