# Registro de evidencia de consolidación (no certificación)

**Fecha de corte:** 2026-10-12  
**HEAD observado al inicio:** `afd48ccfd565ea59365d7d3156d055dfe357547c`  
**Requisito de proceso:** `CHG-006/007/008`, `PLAT-FR-006/007`; carrier documental `DOC-003` / `DOC-004`.  
**Estado de este documento:** inventario de *qué evidencia falta*, no ejecutor de CI ni release evidence package.

## Cómo leer las columnas

- **Integrado:** PR mergeado en GitHub. No indica que compile.
- **QA exact-head:** resultado de pruebas asociado al SHA del carrier o SHA acumulado, no a un commit anterior.
- **Device/runtime:** pruebas reales en el entorno pertinente.
- **Prod/piloto:** terceros, secretos, consentimientos, observabilidad, soporte y rollback.

## Carriles recientes

| Carrier | Merge confirmado históricamente | Tests escritos/descritos | QA exact-head reciente | Verificación real de Mobile | Cierre |
| --- | --- | --- | --- | --- | --- |
| [#256](https://github.com/Enzopinotti/losApuntes/pull/256) | Sí | Sí | **NO ejecutada por esta secuencia** | Sin aceptación física referenciada | Integrado / evidencia pendiente |
| [#274](https://github.com/Enzopinotti/losApuntes/pull/274) | Sí | Sí | **NO ejecutada** | Sin aceptación física referenciada | Integrado / evidencia pendiente |
| [#275](https://github.com/Enzopinotti/losApuntes/pull/275) | Sí | Sí | **NO ejecutada** | Sin aceptación física referenciada | Integrado / evidencia pendiente |
| [#276](https://github.com/Enzopinotti/losApuntes/pull/276) | Sí | Sí | **NO ejecutada** | Sin aceptación física referenciada | Integrado / evidencia pendiente |
| [#277](https://github.com/Enzopinotti/losApuntes/pull/277) | Sí; merge `afd48cc...` | Sí | **NO ejecutada** | Sin aceptación física referenciada | Integrado / evidencia pendiente |
| [#279](https://github.com/Enzopinotti/losApuntes/pull/279) | Sí; merge `6a865864...` | Sí | **NO ejecutada** | Sin aceptación física referenciada | Guardar desde Buscar integrado / evidencia pendiente |

**Actualización:** el registro también incluye el guardado rápido #279, integrado después del corte de auditoría original. El próximo carrier de materias → Q&A debe incorporarse con su SHA real una vez fusionado. No reutilizar el baseline inicial de este documento para afirmar verificación de cambios posteriores.

La lectura de `main` actual incluye muchos otros cambios de Web/Mobile/operaciones. Esta tabla **no afirma** que los cinco carriers sean las únicas modificaciones pendientes de verificación.

## P0 — recuperación de evidencia sin cambiar comportamiento

1. Registrar un candidate SHA exacto y ambiente de build Node 24 / pnpm 9.15.9.
2. Ejecutar `pnpm install --frozen-lockfile` y `pnpm check` (higiene, formato, lint, tipos, tests y builds). **No ejecutado todavía por indicación del usuario.**
3. Ejecutar gates críticos asociados a Resources, Search, Auth y Mobile; registrar fail/pass por job y SHA. La existencia de archivos `*.test.ts` no basta.
4. Ejecutar `pnpm audit:prod` y reconciliar issues de supply chain (#141/#133), sin bajar el umbral por conveniencia.
5. Ejecutar `pnpm runtime:up && pnpm runtime:smoke`, evaluar `resource_saves`/`resource_shares`, índices y datos de prueba reales. No ejecutar contra un entorno productivo ajeno.
6. Instalar en Android/iOS; verificar SecureStore, deep links, uploads, guardados, Search, Q&A, accesibilidad y cambios de cuenta. Las builds/export Expo no equivalen a QA en dispositivos.
7. Al hacer release, registrar env/config/image, SHA observado de API y client, endpoint release y rollback con la **plantilla preexistente** `docs/operations/release-evidence.md`.

No se deben duplicar estos pasos en un segundo sistema de CI; los comandos y matrices actuales son autoridad técnica.

## Bloqueos y dependencias externas

- [#7](https://github.com/Enzopinotti/losApuntes/issues/7): Mobile v1, aceptación y UX.
- [#49](https://github.com/Enzopinotti/losApuntes/issues/49): Mobile Auth.
- [#48](https://github.com/Enzopinotti/losApuntes/issues/48): launch readiness.
- [#83](https://github.com/Enzopinotti/losApuntes/issues/83): release qualification Web/Mobile.
- [#85](https://github.com/Enzopinotti/losApuntes/issues/85): accesibilidad, teclado, foco, ciclo de media.
- [#99](https://github.com/Enzopinotti/losApuntes/issues/99): observabilidad y worker.
- [#100](https://github.com/Enzopinotti/losApuntes/issues/100): recuperación Mongo+Files.
- [#141](https://github.com/Enzopinotti/losApuntes/issues/141), [#133](https://github.com/Enzopinotti/losApuntes/issues/133): dependencias/advisories de producción.

Los issues abiertos son **indicadores de trabajo o riesgo**, no prueba de ausencia total de implementación: cruzarlos con el SHA y sus criterios antes de emitir un estado. Proveedores, piloto institucional y políticas legales siguen requiriendo decisión/acción externa.

## Reconciliación futura del backlog, sin falsos cierres

| Fuente | External keys | Próximo acto documentado |
| --- | --- | --- |
| 04/Backend Actual | `DOC-003`, `DOC-004` | Anexar este mapa al log PRE/POST; actualizar fuentes 01–03 bajo `CHG` y dejar trazabilidad a PR |
| 04/Backend Actual | `ALUM-006/007/008` | Contrastar y actualizar contra matriz Alumni/#67 y criterio de cada tarea; no atribuir Mobile completado |
| 04/Backend Actual | `PROD-018/019/020` | Evidence package, desplegabilidad reproducible y ensayo rollback |
| 05/Frontend Plan | `MOB-001`…`MOB-023` | Auditoría individual de implementación y cobertura, en vez de 23 cambios bulk a done |
| 05/Frontend Plan | `MOB-024/025/026/027` | Mantener abiertos hasta suite/device/beta con evidencia y SHAs |
| 04+05 | `PILOT-*` | Fijar una institución/carreras, corpus de materiales reales y ensayo de primer valor |

**No se han editado los dos Excel operativos**: tienen propietario/proceso propios y la presente revisión no satisface sus criterios de cierre por sí misma.

## Decisión al reanudar la verificación

El usuario ha pedido temporalmente **sin CI**; los próximos PR documentales o de valor rápido podrán integrarse con `[skip ci]`, pero su estado será `merged / unverified`. Cuando se permita validar, preferir ejecutar la suite del **HEAD acumulado** antes de nuevas expansiones de alto riesgo. Nunca citar un run viejo como verificación de un SHA nuevo.
