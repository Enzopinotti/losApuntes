# B76 — Manifiestos versionados y aislamiento de exportaciones legacy

Fecha: 2026-10-16. Base de partida: `main@a763ddc4bf85374d27208ce05db5e7c26bf3c118`.

## Diagnóstico

El test `account-export-versioning.spec.ts` había quedado desalineado con la compatibilidad por versión: esperaba que un trabajo v2 rechazara el registro entero al hallar cualquier contributor extra. Sin embargo, `AccountExportAssembler.writeJsonForVersion` elige `accountExportSectionIds(version)`, obtiene **solo** los contributors requeridos, y aplica `assertAccountExportSections` a ese subconjunto para v1/v2. Esto es intencional: al desplegar v3 (32 secciones), los trabajos v1/v2 preexistentes deben poder finalizar sin incluir secciones nuevas ni invocar lectores privados v3.

El registro global de v3, en cambio, sí se compara con el inventario completo del manifiesto v3. El gate de wiring Nest es adicional. No se modifica ni se debilita ninguno de estos controles.

## Matriz de aceptación

| Escenario | Resultado requerido |
| --- | --- |
| Job v2 sin `study.collections` | FAIL antes de escribir/commit |
| Job v2 sin `study.collections`, con otro contributor no aprobado | FAIL antes de escribir/commit |
| Job v2 con 31 requeridos, un contributor v3 y uno no aprobado | PASS v2, **solo 31 secciones**, no se lee ni serializa ninguno de los extras |
| Job v3 con los 32 requeridos y uno no aprobado | FAIL antes de escribir/commit |
| Job v1 sobre un registro v2/v3 | PASS con exactamente 30 secciones históricas; tests previos se conservan |

## Protecciones inmutables

- No cambiar `ACCOUNT_EXPORT_FORMAT_VERSION` (permanece en 1).
- No leer datos de otro owner, no serializar nuevos privados en versiones antiguas, no introducir fallback de `formatVersion`.
- No tocar S3, claims, lease, SHA, esquemas Mongo ni flags de release.
- La validación de `assertAccountExportSections` para **un inventario completo explícito** sigue rechazando extras o ausencias.
- Mantener release #353 en **HOLD**; no resolver el audit vencido por excepción sin una revisión de la dependencia real.

## Alcance, concurrencia y validación

Este carrier cambia únicamente `account-export-versioning.spec.ts` y este informe. PR #349 comparte el archivo test (formato), por lo que **no fusionar sin reconciliar las dos ramas**. PR #370 arregla el doble de UsersService en otro archivo, PR #351 conserva el arreglo CAS de StudyCollections, PR #369 repara tests S3/Study Progress.

El workflow global se evalúa en el **SHA exacto** del candidato. Las suites objetivo pueden estar verdes mientras el workflow general siga rojo por issues independientes; eso no autoriza deploy, merge ni release.
