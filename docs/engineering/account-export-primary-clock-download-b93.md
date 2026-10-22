# B93 — Reloj del primario Mongo para la disponibilidad y descarga de exportaciones

**Base:** B92 `main@927bce2d91678eee46d792b315da5f3af78561a2`.  
**Release:** #353 OPEN/HOLD. `STUDY_PROGRESS_ENABLED=false`; sin CI manual ni deploy.

## Vulnerabilidad funcional

B85 autorizó el retiro de un artefacto privado usando `artifactExpiresAt <= $$NOW` del primario Mongo, pero `AccountExportService.status()`, `publicStatus()` y `download()` todavía aplicaban el reloj `new Date()` del worker. Esto deja dos estados contradictorios:

- **Worker adelantado:** el archivo todavía está dentro de su retención según Mongo pero la API declara `downloadable:false` o devuelve 410 antes de tiempo.
- **Worker atrasado:** la API puede seguir ofreciendo `available` aun si el primario ya considera vencida la referencia. Durante esa carrera B85 podría retirarla y el cliente ejecutar un GET que no debería empezar. B91/B92 revalidaban el mismo reloj de aplicación, no la fuente primaria que usa la limpieza.

## B93 — autorización exacta de generación y hora

Nuevo `accountExportArtifactLiveOnMongoServer()`, complemento del predicado B85:

```js
{ $expr: { $and: [
  { $eq: [{ $type: '$artifactExpiresAt' }, 'date'] },
  { $gt: ['$artifactExpiresAt', '$$NOW'] }
] } }
```

La implementación `MongoAccountExportStore.isOwnedArtifactCurrent({id,userId,generation,expiresAt})` utiliza un **único** query `exists` contra el primario que exige simultáneamente:

- `id` y `userId` del propietario;
- `state: 'completed'`;
- `artifactGeneration` **exacta**, sin poder usar otra o una retirada;
- `artifactExpiresAt` exactamente igual a la fecha del snapshot leído;
- BSON Date válida y `artifactExpiresAt > $$NOW` evaluada en el servidor.

La consulta falla cerrada ante fecha inválida, objeto no encontrado, respuesta nula/indefinida o excepción de Mongo. No se admite `input.now` como autoridad en el store.

`AccountExportService.status` usa el resultado del primario para calcular el campo público `downloadable`, manteniendo la validación de formato/metadata sin revelar campos privados. `download` mantiene la comprobación de cuenta activa y `findOwned(id,userId)`, valida metadata y consulta `isOwnedArtifactCurrent` **antes** de devolver generación y digest; si el primario no autoriza, responde `expired` (HTTP 410 en controlador). El parámetro histórico de fecha del servicio se conserva como `_now` solo por compatibilidad con los tests/consumidores; no decide autorización de download.

B92 invoca `AccountExportService.download` dos veces (antes y después del preflight S3). Ahora ambos accesos usan el mismo reloj del primario; se conserva el doble GET B91 con SHA y la limpieza B78–B85 sin DELETE inline.

## Casos de prueba

- Servicio Jest: reloj cliente adelantado no corta una exportación todavía vigente según Mongo; reloj atrasado no habilita archivo vencido; error de lectura al primario propaga y no da acceso.
- Store Jest: `exists` exige propietario, estado, generación, expiry exacto, y el predicado `$$NOW`; fecha inválida no consulta S3 ni el modelo.
- Mongo replica-set opt-in: artefacto válido y generación actual autorizados por Mongo, otros dueños/generaciones rechazados; vencido/metadata vieja/referencia eliminada rechazados.
- Node aislado: 9 vectores de predicados reales para límites de vencimiento, diferencias de reloj, tipos inválidos y **complementariedad exacta** de la decisión B93 (descarga) con B85 (retirada), usando una pequeña evaluación local de `$expr`.
- Fuente: `scripts/test-account-export-b93-mongo-download-guard.mjs` valida que `status` y `download` usen la consulta del primario, la pertenencia y que B91/B92 sigan presentes.

## Evidencia y límites

La suite Node evalúa la forma de los filtros reales; **NO ejecuta MongoDB**. La aprobación de expresiones `$$NOW` contra un primario real, JEST Nest/Mongoose, TypeScript/lint, retención contra S3 IAM/versioning, S3 AWS/MinIO, HTTP/browser y seguridad #133/#141 permanecen pendientes. El filtro de lectura no impide que una referencia caduque *después* del query y durante la transmisión: para cerrar la ventana residual hace falta pin/versionado/lease durable, con pruebas y política IAM. No levantar #353.

## Carriles paralelos

Calidad y formato #400/#408/#399/#404/#407/#405/#403/#402 y sus ramas deben rebasear sobre `main` real antes de fusionar. Deben preservar `isOwnedArtifactCurrent`, su consulta exacta con `$$NOW`, el estado público y la doble reautorización B92; ningún snapshot de service/store anterior puede recuperar el reloj local.
