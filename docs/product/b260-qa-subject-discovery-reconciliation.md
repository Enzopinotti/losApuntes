# B260 — Descubrir preguntas por materia en la Web actual

Estado: **candidato en PR, sin integración ni aceptación de release**.

## Proveniencia y motivo

Reconcilia la funcionalidad de la PR histórica #595 (B174) sobre `main@c099bfcf7362ac4b21ba06ace4fa151688796222`, sin fusionar el árbol histórico de Questions.tsx. El archivo del main actual incorpora defensas nuevas de cursor de preguntas, feedback y rutas que deben permanecer intactas. Los tres módulos de catálogo/URL se portaron con blobs originales; se agregaron cambios acotados a la pantalla existente.

## Contrato de producto

- `/questions` permite buscar materias del catálogo existente y filtrar por un Subject UUIDv4 canónico.
- El listado envía `subjectId` por el servicio ya existente; no se agrega API, rol o permiso nuevo.
- URL ausente significa vista global; URL con ID malformado o parámetros `subjectId` duplicados **no consulta preguntas globales**.
- Abriendo una pregunta o publicándola, se preserva el filtro de materia de la URL.
- Copiar filtro produce un enlace del mismo origen sin cuenta, sesión, texto de búsqueda ni ID de pregunta.
- Filtro de materia y cursores históricos se cercan por el mismo `listScopeKey`; respuestas tardías no pueden redefinir la autoridad del contexto actual.
- Se mantiene la privacidad, moderación y visibilidad definida por el backend.
- Estados de error/empty de catálogo y feedback accesible, teclado y target táctil de al menos 44 px.

Requisitos existentes: QA-FR-001, SEARCH-FR-004, PLAT-FR-005, PLAT-FR-007, NFR-SEC-001, NFR-PERF-001 y NFR-A11Y-001.

## Validación a ejecutar en el HEAD exacto

- `node scripts/test-web-social-qa-contract.mjs`.
- `pnpm --filter @losapuntes/web check:types`, ESLint, format y build.
- Tests Q&A/API y runtime/browser smoke con filtro inválido, filtro válido y navegación desde preguntas.
- Quality Gate, coberturas críticas, auditoría de dependencias y revisión de cambios de `main`.

## Límites y gates

No hay cambios de Auth, permisos, datos, locks, publicación ni flags. Los HIGH de node-forge #133 y Zod #705 siguen bloqueando certificación de seguridad/release. El navegador real y Mongo no están certificados por agregar tests estáticos. No activar `STUDY_PROGRESS_ENABLED` ni cerrar #353. `#595` sólo se cerrará como reemplazada si este carrier se valida e integra de forma segura.
