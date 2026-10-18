# B90 — Adaptación de tests de exportación sobre main B116

**Fecha de integración:** 18 de octubre de 2026. **Fuente autoritativa:** `main@76a5b8177d9dd47afda65709fe92924aac2ab22b` (incluye validación S3 B116 de metadatos HEAD, integridad de longitud B115 y propagación de cancelación B114).

## Qué cambió y por qué

Durante este bloque otro agente preparó [#434](https://github.com/Enzopinotti/losApuntes/pull/434) desde `main@a228183ad557e0b3114d983a06d84e1bf463d672` (B114), con CI específica [#39131513056](https://github.com/Enzopinotti/losApuntes/actions/runs/39131513056) **2/2 jobs SUCCESS**, pero GitHub lo mostraba **no mergeable** frente a main B116. También existe la rama histórica [#407](https://github.com/Enzopinotti/losApuntes/pull/407) con fuentes de octubre 16, no importada.

Para adaptar B90 a las protecciones productivas actuales sin sobrescribirlas, se cotejaron **exactamente cinco Git blobs** de tests frente a B114 y B116: los cinco archivos originales seguían byte-a-byte idénticos en ambos commits. Solo entonces se importaron los cinco blobs modificados de #434, sin `ours/theirs`, sin copiar archivos de producción y sin modificar stores, adaptadores, descargas, metadatos, HEAD, locks ni permisos.

### Cinco fixtures portados sin cambiar lógica de producción

- `account-export-processor.spec.ts`: 193 verificaciones de Jest cambiadas a observación equivalente de `mock.calls` (recuentos exactos, cero llamadas y argumentos), más predicados de fechas y resultados v2/v3 manejados como `unknown`, conservando el matcher real.
- `account-export.controller.spec.ts`: contrato tipado del cuadro de validaciones B92 de descargas, generación, tamaño, hash y versión.
- `mongo-account-export-orphan-cleanup.store.spec.ts`: tuplas `updateOne`/`deleteOne` seguras, manteniendo filtros y condiciones de reloj Mongo.
- `mongo-account-export.store.spec.ts`: tuplas de filtro/update y lectura explícitamente validada del documento de `$setOnInsert`.
- `study-progress-export.reader.spec.ts`: documento Mongo corrupto expresado como `unknown` en el fixture, manteniendo el rechazo de exportación privada.

No se desactivó ninguna regla ESLint, no se añadió `any` ni se suprimieron pruebas. Los controles de generación, autoría, cancelación y S3 pertenecientes a B114–B116 quedan en el árbol de `main` y se verifican de nuevo.

## Gates exact-head sin simulación de release

El workflow permanente `b90-b116-export-fixtures.yml` es **read-only**: checkout exacto, Node 24, instalación congelada de pnpm y tres jobs independientes:

1. Prettier API, ESLint cero advertencias para los cinco fixtures, **cinco suites Jest completas** y TypeScript global API.
2. Guards estructurales B114, B115 y B116, más los oráculos ejecutables de GET completo y HEAD estricto.
3. ESLint API **global obligatorio**: informar toda la deuda restante y conservar su resultado rojo si no pasa.

Se requiere adicionalmente el workflow global `verify` en el SHA final, incluidas coberturas críticas, auditoría de dependencias, permisos y pruebas de ejecución disponibles. Un gate focal verde **no** certifica el repositorio ni sustituye aceptación real de Mongo/S3.

**Release issue #353 HOLD.** `ACCOUNT_EXPORT_FORMAT_VERSION=1`, `STUDY_PROGRESS_ENABLED` desactivado; auditoría sin extensión de excepciones, sin fusión a `main`, arranque local ni despliegue.

## Coordinación

Este carrier B90 es alternativa actualizada a #434, no un PR adicional para fusionar junto a él; contiene sus cinco cambios de test y el `main` más reciente. Ambos necesitan revisión, evitar doble aplicación y elegir uno. Las ramas históricas #407, #393, #396 y el stack #408 no deben copiarse completas sobre B116.
