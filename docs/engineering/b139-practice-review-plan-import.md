# B139 — Importar un plan de repaso JSON directamente en Practicar preguntas

**Base:** `main@bc8239e56ec9cb98364acefdd4960ebc117b4032` (B138).
**Release:** issue #353 **HOLD**; `STUDY_PROGRESS_ENABLED=false`.

## Funcionalidad

Dentro de **Practicar preguntas**, el estudiante puede elegir un **plan JSON v1** exportado desde el Planificador o desde el botón "Descargar plan JSON" de B135 y empezar otra ronda con sus preguntas.

- Admite de **1 a 10 preguntas pendientes** (no completadas), todas de **una única materia**, formato `losapuntes.study-session` versión 1.
- Todas deben tener la **misma duración admitida por B135**: 15, 20, 30 o 45 minutos. Se recuperan los minutos y la fecha/hora local opcional de la planificación. Si la fecha ya pasó, habrá que corregirla antes de exportar otro plan; no se crea automáticamente una cita ni una notificación.
- Antes de empezar, la app solicita **cada pregunta** a `communityApi.question` y verifica el UUID y `question.academic.subject.id`. Si alguna es inaccesible, fue eliminada o no pertenece a la materia, **no se inicia ninguna ronda**. No se trabaja con una selección parcial.
- El archivo y la verificación **no cargan títulos, enunciados ni respuestas antiguas** al estado de la práctica. Al comenzar, `startRound` borra las reflexiones y las marcas previas y el detalle individual se consulta otra vez mediante la autoridad asíncrona de Study Practice, con las respuestas ocultas.
- Una pausa B136 existente se mantiene hasta que se verifica todo; solo al iniciar una nueva ronda se descarta. Antes de comenzar la importación se confirma la sustitución.

## Límites y fallos seguros

- Archivo máximo: 64 000 bytes. El lector `readStudySession` exige JSON v1 válido y limite de caracteres; `normalizeRecallQueue` impide duplicados y UUID incorrectos.
- Tareas de recurso, completadas, exceso de diez preguntas, materias distintas, duraciones diferentes o fuera de opciones permitidas se rechazan con error explícito para el usuario.
- Cada consulta de verificación se realiza con el mismo `AbortSignal` de `useAsyncAuthorityFence("practice-import:" + scope)`. Si la cuenta, sesión, materia o foco cambian, los resultados del contexto anterior no deben crear una ronda.
- Mientras se verifica la importación se deshabilitan los botones existentes para iniciar otra ronda; un archivo distinto no puede crear una segunda importación simultánea en el mismo scope.
- No se agregan endpoints, tokens, permisos, persistencia, almacenamiento del archivo, títulos no autorizados, ni acceso a preguntas por el solo hecho de poseer un UUID.

## Aceptación

```bash
pnpm test:web-study-review-plan-import
pnpm test:web-study-recall-focus
pnpm test:web-study-private-report
pnpm test:web-study-recall-pause
pnpm test:web-study-recall-planning
pnpm test:web-study-retry-round
node scripts/test-web-study-practice-integration.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El test B139 integra `pnpm test` obligatorio. Un workflow Node24 read-only repite pruebas y calidad sobre el **SHA exacto**. La validación de navegador en un entorno con dos cuentas, permisos revocados y consultas lentas continúa siendo necesaria antes de liberar a producción.

**Restricciones:** no se alteran dependencias, lockfile, base de datos, API, flags, auditoría ni controles de publicación. #133 y #141 mantienen dependencias vulnerables de producción; release #353 sigue bloqueado.
