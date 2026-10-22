# B109 — GET Range de S3 con lectura incremental y memoria acotada

**Base:** `main@4db13b3d10a02788eba99ea738eeac2fd32c3e20` (B108).  
**Release:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`. Sin CI manual ni deploy.

## Defecto productivo confirmado

El método `readPrefix(objectKey, maximumBytes)` generaba un GET
firmado SigV4 con `Range: bytes=0-(maximumBytes-1)`, pero luego hacía:

```ts
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.byteLength > maximumBytes) throw ...;
```

Un proveedor S3, gateway o proxy defectuoso puede **ignorar Range**
y devolver HTTP 200 con el archivo completo. El chequeo detectaba el
exceso **después de descargar y reservar la totalidad del body**.
Al usar esta API para inspeccionar prefijos, el fallo permite presión
de memoria no controlada aun cuando el llamador pidió pocos bytes.

Además, un stream malicioso puede emitir miles de fragmentos
de longitud cero. Guardar esos fragmentos como entradas de un array
crearía otra forma de retención de memoria sin consumir el límite.

## Corrección funcional B109

Nuevo helper puro `readBoundedS3PrefixBody` bajo
`apps/api/src/files/storage/s3-bounded-prefix-body.ts`:

1. Mantiene la petición GET existente y la firma SigV4, incluido
   el encabezado Range. No altera credenciales, política de acceso,
   nombre de objeto o URLs.
2. Consume el stream por `ReadableStreamDefaultReader.read()`.
   Antes de retener o copiar cada chunk exige
   `chunk.byteLength <= maximumBytes - total`.
3. Si el proveedor devuelve un chunk demasiado grande, un overflow
   progresivo o error de lectura, cancela el stream y rechaza con el
   error original. No descarga el cuerpo completo con `arrayBuffer()`.
4. Ignora chunks vacíos para que una secuencia de ellos no acumule
   entradas sin costo de bytes; conserva copias propias solo
   de los fragmentos admitidos y construye el resultado exacto.
5. Preserva la respuesta vacía previa y los prefijos exactos,
   incluida la cota válida. Rechaza presupuestos no positivos o
   no enteros. La cuota limita bytes **retenidos por el helper**;
   un solo chunk ya entregado por la implementación HTTP puede
   ocupar memoria antes de que la app lo vea.

## Verificaciones nuevas

- **8 pruebas nativas `node:test` de la lógica real**: prefijo
  fragmentado, cota exacta, respuesta vacía, primer chunk enorme
  con cancelación, overflow progresivo con cancelación,
  error de proveedor sin enmascarar, aislamiento de buffer mutable,
  avalancha de chunks vacíos y presupuesto inválido.
- **3 tests Jest** en el adaptador S3: GET firmado con Range,
  rechazo/cancelación temprana, overflow progresivo,
  respuesta vacía y bytes exactos.
- **2 nuevos escenarios localhost TCP firmados SigV4 B87**:
  proveedor que ignora Range y envía un objeto mayor al pedido
  (sin borrado accidental de exportación privada), y respuesta
  exacta compatible.
- Los controles B104–B108 fueron reconciliados; la lista de
  pruebas firmadas pasa de **36 a 38 casos B86–B109**, con inventario
  TAP estricto B107 y Node24 obligatorio para aceptar lanzamiento.

## Evidencia ejecutada / límites

Se creó un árbol mínimo de prueba con **exactamente** el código fuente
del helper y su archivo `node:test` de GitHub, comprobado con
`git hash-object`:

- `s3-bounded-prefix-body.ts`: Git blob
  `c70b29f1c51c0cee1b8d532dc3681f53d42174e4`.
- `test-account-export-b109-prefix-stream.test.mjs`: Git blob
  `331059d29be96a703b99d7d82d9f5be578d52f4d`.

Se ejecutó **Node22.16.0** con
`node --experimental-strip-types --test`:
**8/8 PASS**, 0 failed, 0 skipped, 0 cancelled, 0 todo.

Los tests validan la función de lectura productiva, pero **no son**
un resultado de ejecución del adaptador completo, de la firma HTTP
real ni de Node24.

La batería TCP de **38 escenarios** está definida pero requiere
un checkout Node24/pnpm9 que no está disponible acá. Continúan
pendientes Jest/Nest, typecheck/lint, Mongo replica B94,
S3/MinIO externo con IAM/lifecycle, backup/restore,
navegadores y auditorías #133/#141.

```sh
pnpm test:account-export-b109-bounded-prefix
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

**#353 sigue OPEN/HOLD**. No habilitar exportación privada por
esta corrección aislada ni desplegar sin los gates de aceptación.
