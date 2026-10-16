# B81 — Reconciliación funcional B77 sobre main B80, sin perder S3 B78/B79/B80

Fecha: 16 de octubre de 2026

## Referencias inmutables

- Base definitiva: `main@3579eab49f9d0ad3dd889731695f7a1a155e7efd` (B80 write-ahead claim). Preparado inicialmente sobre B79 `f342a530ac6233f48e660c42a7d4c3af83b9b3ea` y trasladado como **tres commits lógicos nuevos** a B80 sin reemplazar su lógica.
- Carrier original: [PR #374](https://github.com/Enzopinotti/losApuntes/pull/374), `ab5503a62a8443c309431edbc07998d5b414ba09`, basado en `main@96793b0ef9cdb30ac019ef350c415b6e625ac7de`.
- Reporte de conflicto: [PR #380](https://github.com/Enzopinotti/losApuntes/pull/380), [run #38900454143](https://github.com/Enzopinotti/losApuntes/actions/runs/38900454143). El conflicto de #374 contra main está en `mongo-account-export-orphan-cleanup.store.spec.ts`, no necesariamente con #377.

## Integración realizada

Se comprobó que seis fuentes del PR original conservaban **exactamente el blob Git del main de origen** en el nuevo main, por lo que pueden trasladarse sin perder nuevas modificaciones. Cada una se incorpora en commit separado:

1. `data-lifecycle.module.spec.ts`: mock Nest del owner epoch y aceptación fail-closed de progreso cambiado antes de commit.
2. `account-export-assembler.ts`: ninguna fuente privada fuera del manifiesto v3 puede estar montada inadvertidamente, sin cambiar las 30/31/32 secciones del formato persistido.
3. `account-export-contributor-allowlist.spec.ts`: negativo para fuentes no reconocidas en los tres formatos, positivo para jobs legacy con lista v3 legítima.
4. `study-collection.service.ts` y su spec: recuperación CAS exige revisión y ausencia real del recurso; respuesta Mongo que reporta éxito sin ese resultado es conflicto.
5. `study-progress-export.reader.spec.ts`: fixture Mongo corrupto tipado como `unknown`, sin forzar propiedades ajenas al contrato TS.

## Resolución de la colisión B77/B79/B80

**No** se copia el `mongo-account-export-orphan-cleanup.store.spec.ts` original de #374. El nuevo main ya incluye cambios B77, B78, B79 y B80: `verificationUntil` del lease, `nextAttemptAt` protegido, `$max`, `matchedCount`, fences S3 y nuevos tests de expiración. Se conserva su blob y se añade **una sola regresión faltante** B68: `matchedCount=1, modifiedCount=0` representa un lease monotónico válido, y su filtro incluye `verificationUntil: null`. No se cambia ninguna implementación de S3 ni se borra una aserción nueva.

### Validación

El nuevo workflow focal ejecuta checkout del **SHA exacto**, seis suites Jest de regresión (CAS, epoch, registry versioning, allowlist, orphan cleanup y lector privado), `check:types` API y contratos B77/B78/B79. Mantener en paralelo el workflow global `verify`, diez coberturas críticas, formato, lint y auditoría; el focal verde **no autoriza por sí solo un merge**.

El PR #377 es otro carril: formatter Web/API del main previo. **No copiar su snapshot entero**, aplicar su formato al source reconciliado solo tras comprobar que conserva los cambios B79, B80 y B81. El ensayo #380 debe repetirse con refs renovadas. No tocar la política de auditoría ni extender automáticamente el waiver vencido de `node-forge`. La issue de release #353 queda HOLD, formato de export por defecto v1 y Study Progress desactivado.

No se levanta Web/API/Mongo ni se hace deploy.

## Evidencia de base

La comparación entre `main@f342a53` y `main@3579eab` identificó solamente modificaciones de exportación claim/writeahead, Mongo store, pruebas y runbooks: **ninguno de los siete archivos API reconciliados**. Se formaron tres nuevos commits desde `3579eab`, con trees de Git que incorporan cambios sobre la base actual: exportación (3 archivos), Study CAS/progreso (3), y test de orphan más CI/documentación (3). No se hizo force-push, no se modificaron los PR originales. El carrier inicial R02 no debe fusionarse; solo sirve de trazabilidad.
