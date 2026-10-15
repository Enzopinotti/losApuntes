# B57 — Limpieza con precondición transaccional de revisión

## Defecto de B56

El diagnóstico de Colecciones consulta la revisión actual y luego invoca
`DELETE /study-collections/:id/resources/:resourceId`. Aunque el cliente
inspeccionaba la revisión antes del DELETE, Mongo aceptaba una eliminación
sin condicionar esa operación a la revisión anterior. Un segundo dispositivo
podía cambiar los recursos entre ambos pasos.

Además, el frontend asumía que una comprobación HTTP 403/404 representaba
el estado vigente cuando finalmente se eliminaba la referencia.

## Implementación B57

- Extiende el endpoint existente con el **query opcional**
  `?expectedRevision=N` (entero positivo). No rompe clientes antiguos.
- Con precondición, el servicio comprueba **propiedad, versión y presencia de
  la referencia** antes de mirar el Resource.
- Revalida en **backend** el acceso con `ResourceService.get`. Solo
  `NotFoundException` / `ForbiddenException` permiten continuar; accesos
  restaurados generan 409 `STUDY_COLLECTION_REFERENCE_ACCESSIBLE`.
  Errores 5xx/red se propagan y no significan ausencia de permiso.
- El filtro Mongo incorpora `revision: expectedRevision` en el
  `findOneAndUpdate` con `$pull` y `$inc`, **dentro de la sesión**
  coordinada con `User.account_lifecycle_revision`.
- Un `findOneAndUpdate` sin coincidencia **lanza conflicto y revierte** la
  transacción. No puede usar el resultado de un `findOne` como éxito,
  aunque otro dispositivo haya incrementado la revisión.
- La recuperación B56 pasa su revisión actual en cada eliminación, y
  deja de intentar quitar recursos cuando el backend rechaza por conflicto.
  Exige volver a analizar y confirmar en una nueva operación.
- El `DELETE` sin precondición mantiene el comportamiento habitual:
  propietarios pueden quitar manualmente un vínculo aunque el contenido
  ya no sea visible; operaciones repetidas conservan la idempotencia.

## Contrato observable

| Estado | Resultado |
| --- | --- |
| Referencia inaccesible, owner + revisión correctos | 200, `revision + 1` |
| Revisión cambió en otra pestaña | 409 `STUDY_COLLECTION_REVISION_CONFLICT` |
| Referencia se quitó/alteró | 409 `STUDY_COLLECTION_REFERENCE_CHANGED` o conflicto de revisión |
| Se restauró el acceso | 409 `STUDY_COLLECTION_REFERENCE_ACCESSIBLE` |
| No tiene acceso a la Colección | 404 sin revelar contenido ajeno |
| Falló la autoridad del Resource | Error original, **no DELETE** |
| Parámetro inválido | 422 `STUDY_COLLECTION_REVISION_INVALID` o validación DTO |
| Sin parámetro | API heredada, sin cambios de comportamiento |

## Límites y validación pendiente

La precondición es **atómica respecto a la revisión de Colección**, no
respecto a un cambio simultáneo de permisos del Resource. La comprobación
en backend estrecha esa ventana, pero para evitarla por completo haría
falta un diseño transaccional que incorpore la autoridad del recurso.
Por eso la recuperación sigue siendo manual, confirmada y nunca programada.

Ejecutar en un checkout Node 24 / pnpm con servicios y Mongo replica set:
```sh
node scripts/test-study-collections-recovery-b56.mjs
node scripts/test-study-collections-recovery-b56-integration.mjs
node scripts/test-study-collections-b57-integration.mjs
pnpm --filter @losapuntes/api exec jest --runInBand --runTestsByPath src/study-collections/domain/study-collection.service.spec.ts src/study-collections/mongo/mongo-study-collection.store.spec.ts
pnpm --filter @losapuntes/api check:types
pnpm --filter @losapuntes/web check:types
STUDY_COLLECTIONS_TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" node scripts/run-study-collections-mongo-acceptance.mjs
```

**No se acredita aquí una ejecución real de Jest, Mongo, build, Web o E2E.**
La sincronización permanece desactivada por defecto. No hay migración ni
nuevo endpoint ni cambio de persistencia de datos.
