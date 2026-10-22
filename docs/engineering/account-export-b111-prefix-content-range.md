# B111 — Content-Range HTTP 206 obligatorio y vinculado al prefijo solicitado

**Base:** `main@f827fd3aa6c01d206ac0999df2d2119b3f57e482` (B110).  
**Release:** issue #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false` en producción. Sin CI manual ni despliegue.

## Defecto de integración identificado

`S3ObjectStorage.readPrefix()` pide `Range: bytes=0-(maximumBytes-1)`.
B109 lee incrementalmente hasta `maximumBytes`, y B110 firma el
encabezado Range con SigV4. Sin embargo, una respuesta HTTP
`206 Partial Content` podía entregar:

- `Content-Range: bytes 1-8/100`: cuerpo de 8 bytes **de otra posición**,
  no del comienzo del archivo que el escáner cree inspeccionar.
- `Content-Range: bytes 0-3/100` ante una petición de ocho bytes:
  respuesta parcial indebida aunque todavía existan bytes remotos.
- `Content-Range: bytes 0-7/100` con solo 3 bytes reales de cuerpo.
- HTTP 206 sin Content-Range o con tamaño desconocido/malformado.

Antes de B111, si el cuerpo entraba en el límite de B109, se
consideraba un prefijo válido sin comprobar el contrato 206 del
proveedor. Una firma correcta de **la petición** no autentica ni
valida los metadatos de **la respuesta**.

## Corrección implementada

Nuevo helper puro `expectedS3PrefixBytes(status, contentRange, maximumBytes)`
en `s3-prefix-content-range.ts`. La lectura incremental de
`s3-bounded-prefix-body.ts` lo aplica antes de leer el primer chunk,
cancelando el stream al rechazar metadatos incorrectos.

- `HTTP 200`: mantiene compatibilidad con proveedores que ignoran
  Range y devuelven el objeto completo; B109 todavía limita
  bytes leídos/retendidos a `maximumBytes`. Respuesta 200 vacía
  sigue siendo válida.
- `HTTP 206`: exige gramática canónica `bytes 0-END/TOTAL` con
  enteros decimales seguros, `TOTAL > END` y
  `END = min(maximumBytes,TOTAL)-1`.
  Así no se acepta ni un origen distinto de cero ni una ventana
  más corta de la solicitada si todavía quedan bytes en el objeto.
- El stream debe devolver **exactamente `END+1` bytes**;
  los EOF prematuros son errores, no prefijos aceptados.
- 206 sin cuerpo, sin metadata, con tamaño desconocido o
  con offsets inconsistentes **falla cerrado**.
- Respuestas 2xx inesperadas (p. ej., 201, 204) se rechazan como
  contrato de GET de prefijo no reconocido.
- Continúa vigente la cancelación B109 ante overflow/error y
  el rango firmado B110. No se altera ownership B80/B81,
  ni el readback SHA256 B90 ni la autorización privada.

No se declara comprobación criptográfica de bytes de la respuesta:
esto valida su estructura/rango y longitud. La evidencia de
integridad de exportación sigue exigiendo B90.

## Pruebas añadidas

1. **10 pruebas nativas B111** del parser TypeScript y del lector real:
   206 exacto, objeto remoto corto, compatibilidad 200, offset ajeno,
   rango truncado, metadata no canónica, cuerpo menor, cuerpo ausente,
   cancelación por error y techo de bytes.
2. **3 pruebas Jest** del adaptador real: rechazar offset ajeno,
   tramo incompleto y cuerpo truncado; aceptar objeto corto y 200.
   Los fixtures anteriores B109/B110 que simulaban 206 ahora
   presentan Content-Range coherente, o usan 200 para probar
   proveedores que ignoran Range.
3. **2 nuevos casos TCP localhost firmados** en el fixture B87:
   éxito 206 en el inicio exacto de un objeto corto y
   rechazo de offset distinto/EOF prematuro/metadata ausente
   sin borrar objetos privados.
4. Inventario de **42 tests HTTP firmados B86–B111** requerido
   por runner TAP B107, con Node24 y cero omisiones;
   guards B104–B110 conciliados, nuevo B111 y lifecycle.

### Evidencia nativa realmente ejecutada

En el contenedor Node22.16.0, con los archivos GitHub exactos y
el cargador B101 del propio proyecto
`--import scripts/testing/register-api-typescript.mjs`:

- 10/10 nuevas pruebas B111 **PASS**.
- 8/8 pruebas B109 previas **PASS** con el helper B111.
- **18/18 PASS en conjunto**, sin fallos, skips ni TODO.

Hashes `git hash-object` comprobados:
- Parser B111: `1029638992bdab4221d9d7155be680300adc1199`.
- Lector B111: `2057cb067650665568d007732158512ff6c6a776`.
- Tests B111: `8dbf288101e961f6bedf8f20a9fda748c2322f03`.
- Tests B109: `331059d29be96a703b99d7d82d9f5be578d52f4d`.
- Loader B101: `6d334d834d12da07f7c1c57ea2d9efc23e889201`.
- Resolver B101: `d82804f4cad1e9083dd931c8179358f978a81982`.

La primera invocación sin loader falló por la resolución ESM de un
import TS sin extensión; al usar el loader existente B101, las
18 pruebas pasaron. No se atribuye ese fallo a producción.

```sh
pnpm test:account-export-b111-content-range
pnpm test:account-export-b107-release-acceptance
pnpm test:account-lifecycle-contract
```

## Gate externo NO aprobado

**No se ejecutaron** en este entorno los 42 casos TCP firmados
con adaptador completo en Node24/pnpm9, Jest/Nest, TypeScript/lint,
Mongo replica B94, AWS/MinIO real IAM/lifecycle, backup/restore,
navegadores o auditorías #133/#141.

**#353 HOLD**, flag productiva desactivada. Un test unitario
o guard de fuente no equivale a aprobación de lanzamiento.
