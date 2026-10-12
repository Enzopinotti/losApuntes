# Reconciliación documental — Los Apuntes 2026

**Corte revisado:** 2026-10-12  
**Código auditado:** `main@afd48ccfd565ea59365d7d3156d055dfe357547c` (PR #277 integrado).  
**Tipo:** auditoría de diferencias y propuestas de actualización; **NO** cambia por sí misma los estados de los documentos canónicos ni sustituye la planificación Excel.

## 1. Fuentes, jerarquía y alcance

Se contrastaron las seis fuentes provistas en el proyecto:

| Fuente | Autoridad y observación |
| --- | --- |
| **00 — Producto y Estrategia** | Tesis y prioridades: red universitaria contextual; utilidad académica antes que engagement; primer valor = contexto → recurso/persona útil → guardado/acción. No es inventario de código. |
| **01 — Especificación Funcional y Requerimientos** | Requisitos normativos con IDs `MOB-FR`, `RES-FR`, `SEARCH-FR`, `PROD-FR`, `CHG`, etc. Su snapshot Mobile sigue como `PLANNED`; no se modificó la fuente original aquí. |
| **02 — Arquitectura, Dominio y Seguridad** | Backend como autoridad, Account ≠ Profile, Subject ≠ CourseOffering, privacidad y fencing. El snapshot declara todavía Alumni candidate y Mobile pendiente sobre base histórica. |
| **03 — Delivery, Calidad y Operaciones** | Exact-head, critical coverage, runtime, aceptación, evidencia externa y release ≠ merge. Snapshot histórico `main@8a055c16...`; no se debe leer como `main` actual. |
| **04 — Backlog Backend & Integración.xlsx** | Fecha de Dashboard: **24/09/2026**. Pistas relevantes: `DOC-003` reconciliar documentación, `DOC-004` trazabilidad, `PROD-018` evidencia release, `PROD-019` despliegue, `PROD-020` rollback y preparación de piloto. Estados de trabajo son snapshot, no resultado de consulta viva a GitHub. |
| **05 — Backlog Frontend.xlsx** | Plan actual muestra `MOB-001`…`MOB-027` en `todo`, y evidencia histórica de módulos Web; los estados quedaron atrás respecto de muchos commits de Mobile. **No promover masivamente a done** sin criterio propio y evidencia. |

También se inspeccionaron `README.md`, `docs/operations/delivery-traceability.md`, `docs/operations/release-evidence.md`, matrices por dominio, paquetes/scripts de Node/pnpm, carpetas Mobile y referencias GitHub abiertas.

**Regla de autoridad:** la implementación/PR/SHA se confirma en GitHub, la intención y criterios viven en 00–03, los estados operativos viven en 04–05; este reporte es únicamente el mapa de reconciliación, **no una segunda fuente de verdad de estados**. Toda modificación canónica deberá seguir `CHG-001`…`CHG-009`.

## 2. Hallazgos demostrables

### D01 — Mobile pasó de “pendiente” a **implementación parcial extensa**, sin cierre verificado

**Fuentes:** 01/Mobile v1 `MOB-FR-001`…`MOB-FR-009`; 05/`Frontend Plan` `MOB-001`…`MOB-027`; 03/Quality; `apps/mobile` en `main`.

El repositorio **sí** contiene cliente Expo Router, navegación Home/Buscar/Crear/Red/Perfil, sesión de cliente, recursos, guardados, publicación y permisos, además de tests estáticos/unitarios y API compartida. No es correcto describirlo como «inexistente» o `PLANNED` en términos de **código**, pero tampoco como `IMPLEMENTADO/VALIDADO` en todos los requerimientos Mobile: falta evidencia de pruebas, compilación nativa instalada y aceptación real iOS/Android vinculada al corte actual.

**Acción canónica propuesta:** cambiar la *lectura de estado* de Mobile de «pendiente puro» a «implementación parcial integrada / validación pendiente» en 01, 02 y 03; mantener requisitos específicos `MOB-FR` sin cierre hasta contrastar criterio y pruebas. En los Excel, revisar por separado `MOB-001`…`MOB-027`, actualizando únicamente con link a PR/commit y criterios verificados.

### D02 — Cinco slices de autor recientes **sí están mergeados**, pero **no certificados**

**Evidencia de GitHub visible al corte:**

| Carrier mergeado | Capacidad | Relación canónica |
| --- | --- | --- |
| [PR #256](https://github.com/Enzopinotti/losApuntes/pull/256) | Compartir/revocar recurso con persona buscada en Mobile | `RES-FR-006/007`, `MOB-FR-005/007` |
| [PR #274](https://github.com/Enzopinotti/losApuntes/pull/274) | GET owner-only paginado de shares + lista Mobile | `RES-FR-007`, `MOB-FR-005`, `NFR-PRIV-001` |
| [PR #275](https://github.com/Enzopinotti/losApuntes/pull/275) | Biblioteca de publicaciones propias `GET /resources/mine` | `RES-FR-006`, `MOB-FR-005` |
| [PR #276](https://github.com/Enzopinotti/losApuntes/pull/276) | Estadísticas de recursos propios, sin contar visitas inexistentes | `RES-FR-009`, `NFR-PRIV-001`, `PILOT-FR-005/006` como límite semántico, **no** como cumplimiento automático |
| [PR #277](https://github.com/Enzopinotti/losApuntes/pull/277) | Búsqueda/materia/orden en biblioteca autor | `SEARCH-FR-002/006`, `MOB-FR-005/007` |

Los cinco PR fueron integrados en `main` con `[skip ci]` y tests añadidos **sin ejecución certificada**. Los documentos de alcance en `docs/mobile/` describen detalles y escenarios de QA, pero **no equivalen a evidence packages**. No usar runs verdes históricos para calificarlos.

### D03 — Alumni ya tiene una matriz de cierre posterior al snapshot

El 02/Arquitectura y 03/Delivery del paquete documental dicen «Alumni candidate»; sin embargo `docs/product/alumni-lifecycle-v1-completion-matrix.md` en GitHub declara PR #67 mergeado, candidato verde y post-merge en `main` con SHAs/runs identificados. El backlog Backend de septiembre conserva tareas `ALUM-006/007/008` en `todo`.

**Acción:** reconciliar los snapshots 01–03 y `ALUM-006/007/008` **contra la evidencia exacta de la matriz/PR** antes de promoverlos. No confundir Alumni backend/Web validado con aceptación Mobile de continuidad Alumni.

### D04 — La priorización documental no debe convertirse en inflación de features

00 enfatiza «valor antes del efecto red», retorno saludable y tiempo a un recurso útil. La secuencia del roadmap enumera módulos pero no obliga a añadir carpetas/IA/marketplace/mensajería antes de cerrar el recorrido de estudio. 04/05 separan planes actuales de `Future`, incluyendo OCR, semantic search e IA como post-piloto; no son quick wins demostrados.

**Acción:** priorizar puntos de fricción de `onboarding → Buscar → abrir/guardar → volver` y `Crear → compartir`, reutilizando API existente. Definir métrica y riesgo antes de abrir cada carrier.

### D05 — Los guardrails de calidad están temporalmente desacoplados de las entregas

03 y `README.md` exigen `pnpm check` (higiene, formato, lint, typecheck, tests y build), auditoría y smoke exact-head. 04 lleva `PROD-018` y 05 lleva `MOB-024/025/026/027`. Los merges recientes optaron por `[skip ci]`; sin validación del **nuevo** `main` la cadena de evidencia está interrumpida.

**Acción:** registrar deuda explícita por el conjunto de merges no verificados; al rehabilitar verificación, empezar por el **HEAD exacto** y suites Mobile/API+contratos afectadas, luego runtime/device. No afirmar estabilidad/release mientras falte el gate. La ausencia de CI fue decisión temporal, no cambio de norma.

### D06 — Producción/piloto sigue siendo una frontera distinta

01/`PROD-FR-001`…`010`, 03/Release y `docs/operations/release-evidence.md` exigen email, edge/HTTPS, OAuth, storage, secretos, resiliencia, legal, soporte, rollback y qualification de client/API SHA. Issues abiertos al corte incluyen #7 (Mobile), #49 (Mobile Auth), #48 (launch), #83 (release qualification), #87/#100 (recovery), #99 (observability), #141/#133 (supply chain).

**Acción:** no promocionar implementación mergeada a «beta instalable» ni «listo para piloto» sin gates explícitos de dispositivo y entorno.

## 3. Estado honesto por capa (no sustituye la matriz canónica)

| Capa | Código visible | Validación específica de este corte | Release/piloto |
| --- | --- | --- | --- |
| API base Web/domains v1 | Existente, con matrices históricas exact-head | Evidencia previa por módulo; **no prueba los cambios nuevos** | Gate de producción externo pendiente |
| Mobile v1 | Amplio código y rutas Expo integradas | **Sin prueba exact-head actual certificada en esta revisión** | iOS/Android beta pendiente |
| Mis apuntes + permisos + métricas | PR #256/#274/#275/#276/#277 mergeados | Tests escritos; **no ejecutados** en esta auditoría | No aprobado |
| Alumni backend/Web | Matriz de cierre con SHAs y runs de PR #67 | Evidencia histórica propia de ese corte | Mobile alumni no se infiere |
| Dependencias/seguridad de edge | Guardrails/scripts presentes e issues activos | Debe revisarse auditoría actual | Bloqueos abiertos |

## 4. Reconciliación operativa recomendada

1. **`DOC-003`**: actualizar snapshots 01/02/03 para separar `integrado` de `validado`, y añadir fecha/SHA del corte. No eliminar versiones históricas.
2. **`DOC-004`**: enlazar cada tarea Mobile/Resources/Alumni a requisito, carrier, SHA y evidencia exacta. Sin duplicar external keys entre 04 y 05.
3. **`MOB-001`…`MOB-027`**: clasificar `código ausente`, `código integrado sin evidence gate`, `criterio parcialmente cubierto` o `validado`, fila por fila; no marcar todo `done`.
4. **`MOB-024/025/026/027`**: primero suite crítica, luego pruebas nativas e instalación beta. Evitar añadir funciones que impidan estabilizar la entrega.
5. **`PROD-018/019/020`**: preparar evidence package exact-head, despliegue reproducible y rollback, respetando plantilla ya existente en `docs/operations/release-evidence.md`.
6. **`PILOT-001/002/005/007`**: fijar un corpus académico piloto real y criterios de tiempo al primer valor. El contenido legítimo semilla es tan importante como el feature.
7. **Actualización POST del workbook**: registrar PR/merge para este carrier y bloqueos; requiere editar las fuentes operativas conservando la semántica `todo/in_progress/done`, no copiar filas a otro tracker.

## 5. Decisión de consolidación

- **No** crear una segunda backlog en GitHub ni renumerar requisitos existentes.
- **No** alterar aquí el texto normativo de 00–03 ni los estados Excel sin verificación de los criterios de cierre.
- Sí mantener este **mapa de discrepancias** para guiar actualizaciones canónicas controladas.
- La siguiente capacidad debe ser una **intervención pequeña y medible en el loop de valor**, con API server-authoritative existente y control de sesión, evitando nueva infraestructura. Ver [plan de entrega rápida](../product/rapid-value-sequencing-2026-10-12.md).

## 6. Qué no se comprobó

No se ejecutaron `pnpm check`, CI, mobile builds, instalaciones Android/iOS, runtime smoke, dependencia audit actual ni pruebas en ambientes productivos. Las etiquetas anteriores se basan en lectura de documentación y código, PRs/SHAs y estado declarado, y se distinguen deliberadamente de evidencia nueva de ejecución.
