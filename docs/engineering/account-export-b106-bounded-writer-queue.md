# B106 — Límite de memoria y profundidad de la cola S3 por writer

**Base exacta:** `main@713bcd1a6153ac40afac77e3a91642ea3eb01af2` (B105).  
**Release:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false`. Sin CI manual ni despliegue.

## Hallazgo

B105 serializa correctamente `write()`, `complete()` y `abort()`,
pero hace `Buffer.from(chunk)` **sin un presupuesto de memoria** antes
de encolar cada operación. Un llamador que no espere los `write()`
puede retener cientos de copias de chunks privados mientras S3 espera
la respuesta de la primera parte. Hasta las escrituras de cero bytes
producen una cadena de promesas sin límite.

No alcanza con rechazar solo la llamada que excede el presupuesto:
si el llamador ignora ese rechazo y continúa con `complete()`, podría
publicar únicamente los fragmentos anteriores. B104 requiere que
**cualquier fallo irreversible** deje el writer sin autorización para
finalizar esa generación.

## Corrección productiva

Presupuesto máximo **por writer**, incluyendo la operación activa:

- `maximumQueuedSnapshotBytes = 16 * 1024 * 1024` (16 MiB de
  **snapshots encolados o activos**, no una cota del RSS total).
- `maximumQueuedWriteOperations = 32` (incluye chunks de cero bytes).
- `write()` verifica ambos límites **antes de copiar** el chunk.
  Exceder cualquiera pone `failed=true` y devuelve un rechazo
  `S3 multipart writer pending writes exceed limits`.
- La operación aceptada conserva una copia `Buffer.from(chunk)`
  para aislar mutaciones del consumidor. Al completar o fallar,
  un bloque `finally` borra el snapshot privado con
  `snapshot.fill(0)` y libera los dos contadores.
- `complete()` permanece bloqueado tras el exceso, incluso si
  algún PUT previamente aceptado llegó a S3.
- `abort()` mantiene el orden FIFO de B105 y la autoridad B80/B81:
  en exportaciones privadas, `deleteObjectOnAbort:false`;
  cancelar solo el `uploadId`, nunca DELETE Object directo.

Los consumidores deben aplicar **backpressure** esperando cada
`write()`, y dividir chunks mayores a 16 MiB. Si se superan los
límites, ese writer **no se puede reutilizar** para completar la
generación: abortar y crear un intento/generación nueva con la
autoridad pertinente.

Estos límites controlan específicamente los buffers de snapshots
en cola, no las demás asignaciones de Node, `Buffer.concat`, la
pila HTTP ni el tráfico de red.

## Regresiones agregadas

- **4 pruebas Jest** sobre el adaptador: chunk de 16 MiB + 1,
  tres chunks de 5 MiB en espera con rechazo del cuarto y aborto
  seguro, 33 escrituras vacías simultáneas, y cuatro partes
  secuenciales exitosas con liberación del presupuesto.
- **2 casos TCP localhost con verificación SigV4 independiente B87**:
  rechazo anterior a todo request y exceso mientras una iniciación
  multipart está en vuelo, con `DELETE ?uploadId=` al abortar y
  sin `CompleteMultipartUpload` de un objeto parcial.
- Ejecutable firmado actualizado a **34 casos B86–B106**, todos
  requeridos por inventario y TAP anti-skips. Guards B104/B105
  reconciliados, guard B106 nuevo, comandos y documentación.

```sh
pnpm test:account-export-b106-bounded-queue
pnpm test:account-export-b101-signed-http
pnpm test:account-lifecycle-contract
```

## Reproducción funcional red/green ejecutada

Se ejecutó el código operativo exacto de `createMultipartWriter` desde
blobs GitHub B105 `ff62dab0df481574017cf0d7b3afb2617b6448de`
y B106 `efa7b8b9328b8efecb583a33c4fef94047371d77`,
retirando solamente las anotaciones TS y sustituyendo la red/Buffer
en un V8 aislado. Para no reservar decenas de MiB en esta
reproducción se redujeron **ambas cotas proporcionalmente**:
parte a 5 bytes y presupuesto a 16 bytes. Se conservaron
la cola, contadores, condiciones de fallo y métodos del writer.

| Escenario | B105 anterior | B106 corregido |
|---|---|---|
| Un chunk mayor al presupuesto | Acepta 17 bytes y envía PUTs/Complete | Rechaza antes de cualquier request |
| 3 chunks pendientes de 5 bytes + 4.º | Envía cuatro partes y Complete | 4.º rechazado, Complete denegado; INIT, PART1, ABORT |
| 33 escrituras de cero bytes | Las 33 aceptadas | Saturación detectada; no confirma |
| 4 chunks secuenciales de 5 bytes | Cuatro partes y Complete | Igual: cuatro partes y Complete |

**4/4 grupos de comportamiento confirmados.** Esta es una
reproducción aislada del método de producción con dobles de transporte,
no ejecución del binario Node24 ni prueba real de SigV4/TCP.

## Gate de liberación que sigue pendiente

Los 34 tests HTTP firmados completos, el nuevo Jest/Nest, el typecheck
y lint API, Mongo replica B94, S3/MinIO externo con permisos IAM y
lifecycle, backup/restore, navegación y auditorías #133/#141 requieren
ejecución verificable en el checkout canónico Node24/pnpm9.
No certificar release con evidencias del V8 aislado o guards de fuente.

**#353 HOLD**, sin CI manual ni despliegue.
