# B105 — Serialización de write/complete/abort en S3 multipart

**Base:** `main@52b23a335f7387863b0260fb42809401ec13bf94` (B104).  
**Lanzamiento:** issue #353 OPEN/HOLD, producción con `STUDY_PROGRESS_ENABLED=false`. Sin CI manual ni despliegue.

## Carrera confirmada sobre la implementación productiva

B104 volvió **terminal** cualquier fallo de subida, pero el writer seguía
sin arbitrar operaciones simultáneas, lo que podía causar errores aun
cuando ningún request fallara:

- Dos `write()` de 5 MiB lanzados en el mismo turno detectaban
  `uploadId=null`, iniciaban **dos subidas distintas** y ambas partes
  podían recibir `partNumber=1`.
- Un `complete()` concurrente podía observar `uploadId=null` antes de
  que terminara el primer `write`, enviando un **PUT simple de cero bytes**
  y marcando completado un objeto incorrecto.
- Un `abort()` llamado mientras `CreateMultipartUpload` seguía
  esperando podía establecer `aborted=true` sin conocer el ID;
  el `write` continuaba después del ACK, creando una subida que no
  había sido cancelada.
- Dos `complete()` paralelos sobre un PUT simple podían escribir dos
  veces la misma generación.

## Solución

Se mantiene el método real `underlyingWriter` (B80–B104 intacto),
envuelto en una **cola de operaciones FIFO por instancia**:

1. `write(chunk)` hace una copia inmediata `Buffer.from(chunk)`
   para que el llamador no pueda modificar bytes en espera. Encola el
   `write` existente. El costo de memoria por solicitudes concurrentes
   depende de los chunks que el llamador ponga en cola: los consumidores
   deben conservar backpressure y esperar cada `write()`.
2. `complete()` establece `completionRequested=true` sincrónicamente
   y espera que terminen todos los writes previamente aceptados.
   No admite escrituras nuevas y una segunda llamada concurrente se
   serializa/idempotentiza, sin repetir PUT ni POST tras éxito.
3. `abort()` establece `abortRequested=true` sincrónicamente; no
   permite nuevos writes/complete, y espera a que acaben los requests ya
   admitidos para conocer el `uploadId` real antes de enviar
   `AbortMultipartUpload`.
4. Una operación rechazada conserva su rechazo individual para el
   llamador; la cola interna captura ese error **solo para permitir**
   el aborto posterior. El flag terminal `failed` de B104 impide
   posteriores operaciones inseguras sobre la misma generación.
5. Para cuenta privada `deleteObjectOnAbort:false`: nunca hay
   `DELETE Object` fuera de las generaciones owner-fenced de B80/B81.

No se cambia el contrato HTTP de S3 ni las comprobaciones B96–B103.

## Evidencia red/green ejecutada sobre el cuerpo real

Se extrajo `createMultipartWriter` de los blobs GitHub anterior
`386867f64bff13250c7df75301f967c03844af75` y B105
`ff62dab0df481574017cf0d7b3afb2617b6448de`.
Las anotaciones TS y el transporte fueron sustituidos en un ejecutor
V8 aislado; el umbral de parte se redujo de 5 MiB a cinco bytes,
conservando **el código operativo de write/complete/abort/cola**.

| Escenario | B104 anterior | B105 corregido |
|---|---|---|
| Dos writes + complete simultáneos | POST init dos veces, PUT simple vacío, dos partes número 1 | Un solo init; partes 1 y 2; POST Complete en orden |
| Abort durante inicio pendiente | No se envió DELETE multipart; PUT llegó después de abort | Init, PUT de parte, luego DELETE uploadId |
| Dos complete sobre PUT pequeño | Dos PUT idénticos | Un solo PUT |
| Mutación de chunk en espera | Writes podían iniciar generaciones/partes duplicadas | Copia inmediata; cola conserva bytes originales |

**4/4 escenarios de reproducción funcional corregidos**. Son
comprobaciones V8 de lógica real con transporte sustituido, **no**
ejecución de SigV4 por TCP ni de Nest/Jest.

## Regresiones agregadas al repositorio

- **5 tests Jest** de concurrencia y datos mutables, ordenamiento,
  rechazo tras error, aborto durante inicio y idempotencia.
- **4 tests de HTTP localhost firmado SigV4** con servidor B87: orden
  exacto de PUT/POST, aborto posterior al uploadId, PUT pequeño único,
  fallo de parte sin confirmación posterior.
- El runner firmado requiere ahora **32 casos B86–B105**, nombres únicos
  y 0 skipped/fail/todo/cancelled; guard B104 reconciliado y nuevo guard
  B105; scripts de `package.json` actualizados.

```sh
pnpm test:account-export-b105-concurrency
pnpm test:account-export-b101-signed-http
pnpm test:account-lifecycle-contract
```

## Gate pendiente

Este entorno no dispone de checkout completo ni Node24/pnpm9 ni un
servicio S3 real, por lo que **no se ejecutaron** los 32 casos HTTP
firmados completos, el Jest de Nest, typecheck/lint, Mongo replica B94,
AWS/MinIO real con IAM/lifecycle, backup/restore, navegador o auditorías
#133/#141. No declarar release ni despliegue por una reproducción aislada.

**#353 continúa HOLD** y la flag de producción permanece deshabilitada.
