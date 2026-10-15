# B50 — Colecciones persistentes: aceptación transaccional y no-resurrección

**Estado:** corrección integrada detrás del feature gate de persistencia, sin activación en producción. El nombre B50 no significa que Mongo/S3/E2E ya hayan aprobado.

## Defecto resuelto

B47 serializaba **únicamente `create`** con `closeAccount` mediante una actualización del mismo documento `User.account_lifecycle_revision`. Los métodos `updateOwned`, `addResource`, `removeResource` y `deleteOwned` escribían fuera de transacción y no participaban en ese conflicto.

B50 introduce `MongoStudyCollectionStore.withActiveOwnerTransaction`: cada operación privada abre una sesión, comprueba el estado activo del propietario y escribe la revisión del usuario **en la misma transacción** que su cambio de colección. Un usuario cerrado recibe el error `STUDY_COLLECTION_ACCOUNT_INACTIVE` antes de escribir datos. Una carrera entre transacciones afecta a la misma fila `User`; MongoDB puede provocar un conflicto transitorio que deberá reintentarse según su mecanismo normal de transacciones.

La consulta de respaldo cuando agregar o quitar un recurso no cambia nada también se realiza con la **misma sesión**, en vez de salir de la transacción. La lectura pública de recursos no habilita nuevas escrituras. El método de creación conserva claves idempotentes y reintentos por índice único.

`MongoAccountLifecycleStore.closeAccount` mantiene el borrado de `study_collections` por dueño en la misma transacción que marca `User.account_status='closed'`. No se borra ningún dato de otra cuenta.

## Gate 1 — Unit tests

```bash
pnpm --filter @losapuntes/api test -- --runInBand mongo-study-collection.store.spec.ts
pnpm --filter @losapuntes/api test -- --runInBand mongo-account-lifecycle.store.spec.ts
node scripts/test-study-collections-b50-integration.mjs
```

Los tests de almacén incluyen los cinco caminos de mutación y comprueban que todos utilicen la misma sesión y que una cuenta cerrada no pueda alterar registros. El control de código revisa además que el flag siga apagado por defecto y que Account Export v2 no pierda la consulta propietaria incorporada en B49.

## Gate 2 — Real Mongo replica set, opt-in

La suite nueva `study-collection-lifecycle.mongo-int.spec.ts` usa **los modelos Mongoose reales**, el store real y el servicio real de cierre. Ejecutar con una base Mongo local **replica set**, por ejemplo la provista por `compose.local.yml`, usando la URI accesible desde el proceso que lanza Jest:

```bash
STUDY_COLLECTIONS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
  pnpm --filter @losapuntes/api test -- --runInBand \
  study-collection-lifecycle.mongo-int.spec.ts
```

La URI debe apuntar al replica set local y no tener credenciales. La suite valida protocolo, hostname y `replicaSet`; crea una base `losapuntes_b50_<uuid>` nueva y **solo elimina esa base generada**. **Nunca** se debe utilizar una base compartida o de producción. Si falta `STUDY_COLLECTIONS_TEST_MONGO_URI`, Jest **saltea** la suite; una suite salteada no es un PASS.

Casos:
1. Crear, editar, agregar, quitar y eliminar con cuenta activa; luego cerrar y comprobar que sus colecciones desaparecieron.
2. Cerrar primero y verificar que las cinco mutaciones reciben 403 del dominio y no crean contenido.
3. Cerrar cuenta A y preservar colecciones editables de cuenta B.
4. Disparar creación y cierre concurrentes; si el cierre se confirmó, no debe quedar ninguna colección del propietario.
5. Provocar fallo de auditoría dentro del cierre y comprobar que tanto la cuenta como las colecciones vuelven al estado anterior (rollback completo).

## Gate 3 — Exportación, interfaz y build

B50 no modifica el ensamblador de Account Export para no interferir con el PR #331. Antes de activar producción, ejecutar ambas versiones (30/31 secciones), las pruebas de rollback B49 y los controles de S3, junto con los PR #333 (Web typecheck) y #318 (UI de exportación). Revisar:

```bash
pnpm --filter @losapuntes/api check:types
pnpm --filter @losapuntes/api lint
pnpm --filter @losapuntes/api build
pnpm --filter @losapuntes/api test:ci
```

**No se ejecutó** build completo, Jest real, Mongo, S3 ni navegadores en esta sesión por falta de checkout y servicios locales. Los tests y este contrato forman parte de la entrega para que el QA pueda repetirse en un entorno completo.

El feature flag `STUDY_COLLECTIONS_ENABLED` sigue desactivado por defecto. No cambiar variables productivas hasta que los gates sobre el SHA desplegable hayan sido certificados.
