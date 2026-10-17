# B72 — Validación concurrente y acotada de una sesión de estudio

## Problema y alcance

En `main@8e254d1d1807ff2aa01ce4fea232ed1340dbac53`, `StudyRunner.loadPlan` verificaba secuencialmente cada referencia del JSON o borrador. Una sesión válida puede contener 24 actividades; abrirla podía requerir hasta 24 rondas de latencia de red, aun cuando ya existían verificaciones concurrentes con límites en otros recorridos.

Este bloque implementa una mejora de latencia y respuesta para la **ejecución de sesiones**, sin cambiar el formato de Study Session v1 ni los contratos HTTP. Se vincula con el requisito transversal `NFR-PERF-001` (lecturas acotadas) y con `PLAT-FR-001` / `NFR-SEC-001` (autoridad y fail-closed).

## Contrato

- La API de Resources o Q&A **sigue verificando cada ID**, con el Subject canónico del plan. El lote no reusa etiquetas importadas, tokens, contenido ni una proyección local como autorización.
- Hasta **cuatro** comprobaciones en curso como máximo; 24 actividades máximo según el contrato existente. No hay fan-out sin límite.
- No se modifica estado de React hasta la terminación del lote. Cambio de cuenta, sesión, materia o request abortado devuelve `null` y descarta cualquier resultado parcial.
- 403/404 sobre una actividad permanece como `null` para esa actividad; 401, errores de red o fallos inesperados interrumpen la operación y mantienen el mensaje de error. No se convierte una falla general en éxito parcial.
- No se agregan endpoints, dependencias, persistencia, analytics, permisos nuevos ni cambios a exportación privada.
- Permanece la confirmación server-side al marcar una tarea y la nueva verificación antes de crear un repaso.

## Evidencia esperada y límites

`pnpm test:web-study-task-verification` cubre 24 tareas, pico de concurrencia, unicidad, revocación, cambio de autoridad, error de API, formato inválido e integración del runner. `pnpm --filter @losapuntes/web check:types` y Prettier Web deben ejecutar sobre el **HEAD exacto** del PR. Los Quality/Dependency gates generales no se desactivan aunque existan fallos independientes.

Esto es entrega de código y contratos automáticos. No declara UX probada en navegador, API levantada, producción ni release público.
