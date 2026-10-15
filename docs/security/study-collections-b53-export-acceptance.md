# B53 — Aceptación Mongo: portabilidad privada, rollback y reporte exacto

**Estado: código de prueba integrado, funcionalidad productiva sin modificaciones.**
**No ejecutar el despliegue productivo a partir de la integración de este bloque.**

## Alcance nuevo respecto de B52

Las Colecciones persistentes son datos privados asociados al propietario. B49
introdujo una lectura `hasOwnedCollections` para garantizar que una cuenta
siga solicitando exportación **v2** después de desactivar la sincronización
(`STUDY_COLLECTIONS_ENABLED=false`), siempre que conserve colecciones.

B52 verificaba carreras de escrituras/cierre, pero **no hacía la aceptación
real de esa lectura propietaria ni su proyección a la exportación**.

### Dos nuevos escenarios de integración con Mongo real

**11. Aislamiento y paginación del exportador propietario.** Se crean dos
colecciones de A y una de B, se consultan páginas de a un elemento con
`StudyCollectionExportReader` real, y se verifica:
- orden estable por ID, sin duplicados ni referencias de B;
- `nextCursor` para continuar y `null` al finalizar;
- ausencia de `ownerUserId`, `operationKey` e identificadores internos;
- un cursor emitido para A no es aceptado como cursor de B.

**12. Portabilidad tras rollback y cierre.** Con ambas cuentas activas y
colecciones guardadas, se solicita `AccountExportService.request` usando
un `StudyCollectionExportReader` **real conectado a Mongo** y un store de
trabajos simulado (sin S3): aunque el flag esté apagado, se exige v2.
Luego se cierra A mediante el store transaccional real: su colección ya no
debe aparecer y `hasOwnedCollections(A)` debe ser falso, mientras que B
conserva su colección y continúa solicitando v2.

Esta prueba valida la selección de la versión y lectura de colecciones,
**no genera un JSON completo ni verifica artefactos S3**. Los gates del
ensamblador, permisos y descarga siguen siendo independientes.

## Gate más estricto: 12 pruebas únicas exactas

`validateStudyMongoJestReport` exige:

- exactamente una suite con la ruta esperada;
- `success=true`, ninguna prueba fallada, omitida ni pendiente;
- `numTotalTests=numPassedTests=12`;
- exactamente **12 assertions con estado passed**, nombres completos
  idénticos al catálogo obligatorio y **sin duplicados**;
- ningún nombre adicional ni similitud parcial aceptada como reemplazo.

Antes bastaba una coincidencia `fullName.includes`; B53 la reemplaza por
comparación exacta. El validador se prueba ante reportes manipulados,
duplicados, incrementos falsos en contadores y suites adicionales.

## Ejecución real obligatoria

```sh
# En un checkout exacto con Node 24, pnpm 9.15.9, Mongo replica set local:
node scripts/test-study-collections-b52-gate.mjs
node scripts/test-study-collections-b53-integration.mjs

STUDY_COLLECTIONS_TEST_MONGO_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" \
  node scripts/run-study-collections-mongo-acceptance.mjs

pnpm --filter @losapuntes/api check:types
pnpm --filter @losapuntes/api exec jest --runInBand
pnpm --filter @losapuntes/api build
```

El runner sigue rechazando conexiones remotas y controlando limpieza de DB
temporal. Si no se define Mongo, el gate falla en lugar de considerar una suite
`describe.skip` como exitosa.

## Límites y convivencia

No se alteran el `AccountExportService`, la proyección Mongo, la aplicación
Web, los formatos de exportación ni las flags. Se preservan los 30 apartados
v1 y los 31 apartados v2. `STUDY_COLLECTIONS_ENABLED` sigue **false** por
defecto. No se incluyó CI en el PR, por decisión de integración de los carriles.

La ejecución aislada del parser **no certifica un Mongo real**. Para aprobar
producción hacen falta pruebas Mongo con transacciones, export v1/v2 de extremo
a extremo, S3 y verificación Web autenticada.
