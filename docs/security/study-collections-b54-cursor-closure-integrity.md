# B54 — Cursores de Colecciones y cierre concurrente verificable

**Estado:** ajustes de dominio y de aceptación integrables con la sincronización
persistente todavía desactivada por defecto. Ejecutar el gate real de Mongo
antes de cualquier activación productiva.

## 1. Cursor de recursos tras una reducción de Colección

El cursor privado `GET /study-collections/:id/resources?cursor=…`
contiene `ownerUserId`, `collectionId`, `revision`, `index` y
`version`.

**Defecto corregido:** `itemsCursor` comprobaba que
`index < resourceIds.length` **antes** de verificar que el cursor
perteneciera a la revisión vigente. Si otra sesión quitaba un recurso y el
cursor conservaba un índice igual al nuevo tamaño, la API devolvía
`STUDY_COLLECTION_CURSOR_INVALID` (422) en lugar de
`STUDY_COLLECTION_CURSOR_STALE` (409).

**Comportamiento B54:**
- Estructura, propietario, colección, índice no negativo y revisión entera
  válida siguen siendo requisitos del cursor.
- Si el cursor está correctamente formado pero refiere a una revisión
  anterior, devuelve **409 STALE**, aun si la lista ahora es más corta o
  está vacía. La interfaz puede limpiar el detalle y recargar desde el inicio.
- Si la revisión coincide, pero el índice es inválido, devuelve **422 INVALID**.
- Una cadena vacía proporcionada explícitamente deja de significar
  «primera página» y se considera un cursor inválido. Solo omitir el
  parámetro inicia la paginación.

## 2. Carrera de creación contra cierre de cuenta

La prueba de B50 permitía aprobar una ejecución en la que el cierre inicial
fallaba por un conflicto de transacción y la creación ganaba, sin exigir
que el cierre hubiera terminado confirmándose.

B54 reutiliza un cierre de cuenta de recuperación **acotado a tres intentos**
cuando la primera solicitud concurrente no confirmó. Solo acepta la suite
si observa un `account_status=closed` real y **cero documentos privados**
del propietario. Esta misma verificación se aplica a las carreras
crear/editar/agregar/quitar/eliminar. Un problema permanente en Mongo
produce fallo visible: no se convierte en un PASS por el solo hecho de
que una transacción haya sido rechazada.

## 3. Nueva aceptación Mongo y pruebas aisladas

Se agrega un escenario número **13**, que crea dos referencias, obtiene
una página, elimina el elemento que estaba en la siguiente página
y verifica que el cursor antiguo produce un conflicto de revisión.

El validador existente exige exactamente 13 nombres de prueba, sin
omisiones ni duplicados. Se actualizaron los scripts históricos B52/B53
para que comprueben las invariantes vigentes y no busquen patrones ya
reemplazados.

Para ejecutar en checkout real:

```sh
node scripts/test-study-collections-b54-cursor.mjs
node scripts/test-study-collections-b50-integration.mjs
node scripts/test-study-collections-b52-gate.mjs
node scripts/test-study-collections-b52-integration.mjs
node scripts/test-study-collections-b53-integration.mjs
STUDY_COLLECTIONS_TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" \
  node scripts/run-study-collections-mongo-acceptance.mjs
pnpm --filter @losapuntes/api check:types
pnpm --filter @losapuntes/api build
```

Los scripts aislados no acreditan Mongo, S3, autenticación E2E ni el build
completo. La prueba con replica set de Mongo **todavía necesita ejecutarse**.
No activar `STUDY_COLLECTIONS_ENABLED` sin esa evidencia.
