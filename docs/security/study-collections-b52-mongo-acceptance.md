# Bloque B52 — Gate real MongoDB para Colecciones persistentes

**Estado:** suite y runner implementados; aceptación real **pendiente** hasta ejecutarse con Node 24, pnpm 9.15.9, dependencias y Mongo replica set local. Este PR no activa sincronización ni CI.

## Por qué era necesario

B50 protegió las cinco mutaciones contra el cierre de cuenta, pero su aceptación de Mongo real probaba una carrera concurrente únicamente para la creación. Además, la suite `describe.skip` sin `STUDY_COLLECTIONS_TEST_MONGO_URI` podía considerarse visualmente verde aunque **ningún test** se hubiera ejecutado.

B52 amplía el conjunto a **10 escenarios requeridos** y añade un ejecutor explícito que falla si faltó Mongo, Jest se salteó una prueba, faltan nombres de escenarios o el reporte no acredita el total.

## Matriz obligatoria

1. Cinco operaciones persistentes (alta, edición, agregar, quitar y eliminar) antes del cierre, con borrado completo al cerrar.
2. Cierre antes de las cinco operaciones: todas rechazadas.
3. Cierre de A conserva y permite editar las colecciones de B.
4. Carrera entre creación y cierre.
5. Carrera entre **edición** y cierre.
6. Carrera entre **agregado** de recurso y cierre.
7. Carrera entre **quita** de recurso y cierre.
8. Carrera entre **eliminación** y cierre.
9. Repetición con la misma `operationKey`: una única colección.
10. Error deliberado en auditoría: rollback de estado de cuenta y documentos de Colecciones.

En las cuatro carreras nuevas, los conflictos de escritura legítimos pueden abortar una transacción Mongo. B52 **no acepta eso como cierre aprobado**: después de que ambas operaciones terminan, intenta completar el cierre si se abortó y comprueba `User.account_status='closed'` y cero documentos `study_collections` del dueño.

## Ejecutar QA real (opt-in)

Usar una instancia Mongo local con replica set inicializado. El ejecutor **rechaza** conexiones remotas, credenciales, una ruta que seleccione una base y URIs sin `replicaSet`.

```sh
# 1. Dependencias del monorepo ya instaladas: pnpm install --frozen-lockfile
# 2. Levantar / inicializar un replica set Mongo local compatible.
STUDY_COLLECTIONS_TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" \
  node scripts/run-study-collections-mongo-acceptance.mjs
```

El ejecutor llama a Jest con `--runInBand --runTestsByPath` y archivo de reporte JSON temporal, valida todos los casos requeridos y borra su reporte al finalizar. La propia suite genera `losapuntes_b50_<uuid>`, verifica el primario **y que todos los miembros anunciados por el replica set sean locales**, y elimina **solo esa base temporal**. Si esa validación falla, no intenta borrar ninguna base. Si Jest falta, Mongo falla o una prueba se saltea, el proceso termina con código de error.

Verificación del validador **sin Mongo**:
```sh
node scripts/test-study-collections-b52-gate.mjs
node scripts/test-study-collections-b52-integration.mjs
```
Estas pruebas solo comprueban el contrato del runner y de los tests; no acreditan transacciones reales.

## Riesgos y gates posteriores

- Ejecutar `pnpm --filter @losapuntes/api check:types`, Jest unitario, lint, prettier y build contra SHA exacto.
- Verificar exportaciones v1/v2 con S3 y los casos de rollback B49; esta suite se limita al ciclo de vida de colecciones.
- Validar experiencia Web desde dos sesiones, permisos, 100 recursos, solicitudes interrumpidas y cierre de cuenta.
- Los PR paralelos #331/#333 son borradores con correcciones de código ya incorporadas en B51. No trasladar sus workflows ni fusionar sus ramas sin revalidar.
- Mantener `STUDY_COLLECTIONS_ENABLED` desactivado en producción hasta completar los gates.

**No afirmar un PASS de Mongo si no se ejecutó el runner y se observó el resultado en un replica set real.**
