# B104 — Bloqueo irreversible del writer S3 ante fallos de partes o ACK ambiguo

**Base verificada:** `main@daa04459d0637ad617f3a117a5c1722f476edcfc` (B103).  
**Producción:** issue #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`.
No ejecutar CI manual ni desplegar.

## Defecto productivo

El método `flushPending()` del writer multipart **retira los bytes del
buffer local antes de esperar la confirmación PUT de S3**. Cuando un
`PUT ?partNumber=n&uploadId=...` responde 503, no devuelve ETag o pierde
el ACK, el error llega a `write()`, pero anteriormente el writer seguía
aceptando nuevos `write()` y `complete()`.

Caso peligroso: parte #1 confirmada, parte #2 rechazada, buffer #2
vacío y `parts=[{partNumber:1,...}]`. Una llamada posterior a
`complete()` podía enviar `CompleteMultipartUpload` con **solo la
parte #1** y marcar un artefacto incompleto como completo. El chequeo
de readback B90 seguiría protegiendo exportaciones privadas; la
corrupción no debe aceptarse tampoco en el adaptador genérico.

Análogamente, si falla `CompleteMultipartUpload` de manera ambigua,
reintentar `complete()` puede enviar un segundo commit de una
generación ya persistida. Lo mismo ocurre con PUT simple y ACK perdido.

## Corrección

El writer retiene un flag interno `failed`, inicialmente `false`.
Una excepción durante `write()` (incluyendo inicio/part/ETag) o
`complete()` deja `failed=true` de forma irreversible. Después:
- `write()` rechaza con estado no escribible, sin nuevas peticiones.
- `complete()` rechaza *antes* de reenviar PUT o CompleteMultipartUpload.
- `abort()` permanece disponible, usando solo el uploadId de ese
  multipart cuando existe. Para exportación privada
  `deleteObjectOnAbort:false`: **nunca DELETE Object no autorizado**.

No se oculta el error original: el primer fallo se relanza. Una nueva
subida requiere un **nuevo writer y una nueva generación autorizada**
por el flujo del producto, no reutilizar un intento ambiguo.

## Regresiones introducidas

Pruebas Nest/Jest del adaptador y HTTP localhost con verificación SigV4
independiente B87 para:
1. Falla de primer PUT multipart: rechaza reescritura/completado; abort
   solo con uploadId.
2. Primera parte subida y **segunda parte fallida**: jamás finalizar
   el objeto truncado.
3. ACK final S3 ambiguo tras commit simulado: **no re-POST**, preservar
   objeto y enviar solo abort multipart.
4. PUT simple con respuesta perdida después de almacenar bytes:
   **no re-PUT** y **no DELETE Object**.

El fixture B86 soporta códigos 503 inyectados en partes **después de
verificar SigV4**. El runner B101/B104 ahora requiere **28 tests**
con nombres únicos y presencia de B102–B104; el verificador TAP exige
0 skipped/fail/cancelled/todo y PASS para todos los casos.

```sh
pnpm test:account-export-b104-fail-closed
pnpm test:account-export-b101-signed-http
pnpm test:account-lifecycle-contract
```

## Evidencia y límites

La revisión de origen confirmó el defecto de pérdida del buffer y la
ausencia anterior de un estado terminal. Los guardias de fuente B104
revisan el orden de las operaciones y la cobertura de escenarios, pero
**su resultado no constituye prueba HTTP ejecutada**.

No hay checkout GitHub utilizable en este contenedor ni Node 24/pnpm 9;
tampoco acceso a GitHub raw desde la red del contenedor. Por eso
**no se ejecutó** el conjunto de 28 tests HTTP reales, Jest/Nest,
TypeScript completo, Mongo replica B94 o S3/MinIO externo.
No certificar release por cambios integrados o pruebas de fuente.

Se mantienen B80/B81 ownership y orphans, B90 SHA256 de readback,
B91–B93 autorización de descarga, B96–B103 validación de ACK S3.
**#353 HOLD**.

## Reproducción red/green adicional sobre el método real

Se recuperó de GitHub el cuerpo exacto `createMultipartWriter` desde
el commit anterior `9953f447cbb22093e766f56ebcfda6bbce17b558` y desde el
commit B104 `386867f64bff13250c7df75301f967c03844af75`.
Se aislaron anotaciones TypeScript y dependencias de red, conservando
la lógica real `write`, `flushPending`, `complete`, `abort`. Con un
transporte en memoria y tamaño de parte reducido a cinco bytes se
ejecutaron cuatro escenarios **en ambas versiones**:

| Fallo | Antes | Después |
|---|---|---|
| Primer PUT multipart HTTP 503 | complete fallaba por falta de partes | Complete bloqueado por fallo previo; abort permitido |
| **Segundo PUT** HTTP 503 tras primer éxito | **Complete emitía POST y confirmaba objeto incompleto** | **No se emite POST Complete**; abort uploadId |
| Complete HTTP 200 con ACK falso | **POST Complete repetido** al reintentar | Solo un POST; abort uploadId |
| PUT simple 503 | **PUT repetido** tras respuesta ambigua | Un único PUT; sin DELETE Object |

Esta es evidencia **funcional aislada red/green del método productivo**
(no solo búsqueda de regex), aunque no sustituye HTTP real con firma,
comportamiento de Buffer/stream y validación de build Node24.
