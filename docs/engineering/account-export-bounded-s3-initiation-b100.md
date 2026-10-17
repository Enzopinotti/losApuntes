# B100 — S3 multipart initiation acotado y autoritativo

**Base exacta:** `main@497b8270a83affe51a28c2bd8c7e2647e94cf143` (B99).  
**Alcance:** adaptador de S3 compartido y aceptación local de exportaciones privadas. Sin modificar HTTP público, contratos Mongo o UI.

## Defecto encontrado

B97 limitó a 64 KiB el body HTTP de `CompleteMultipartUpload`, y B99 endureció su XML. Sin embargo, el paso previo `CreateMultipartUpload` todavía hacía `await response.text()` y extraía `<UploadId>` con un regex no anclado. Un proveedor/proxy que devuelve 200 con cientos de MB, HTML que contiene una etiqueta falsa, un `UploadId` duplicado o XML malformado podía agotar memoria o lograr que el proceso firmase `PUT` de partes para una generación no validada.

## Cambio de implementación

1. Reutilizar el lector en streaming de B97 mediante `readBoundedS3MultipartInitiationXml`. El presupuesto de respuesta es de **65 536 bytes antes de decodificar**; UTF-8 fatal, cancelación en error y cierre del reader.
2. Validar `InitiateMultipartUploadResult` con un helper dedicado `parseConfirmedS3MultipartUploadId`: XML opcional con declaración y namespace S3 oficial, campos `Bucket`, `Key`, `UploadId` planos y sin duplicados. Se requieren raíz correcta, ID único/no vacío, longitud máxima y ausencia de espacios/controles; se rechazan entidades inválidas y cuerpos/siblings extraños. Cuando aparecen los campos Bucket/Key se comparan contra el destino esperado antes de autorizar la primera parte.
3. Solo asignar `uploadId` y comenzar los `PUT partNumber` después de ambas comprobaciones. No hacer fallback silencioso a un regex.
4. Respetar la semántica existente de `CompleteMultipartUpload` (B96–B99), readback SHA-256 (B90), reautorización (B92–B93) y limpieza durable owner-fenced (B80–B81).

## Frontera de recuperación

Si el proveedor ya creó un upload pero responde XML inválido, todavía no se conoce un `uploadId` confiable. **No intentar cancelar ni borrar un objeto mediante un identificador inferido**; el lifecycle configurado para `AbortIncompleteMultipartUpload` recupera esas iniciaciones huérfanas. Para exportaciones privadas, cualquier objeto confirmado/ambiguo sigue bajo el worker owner-fenced. El contrato no convierte una respuesta 200 en evidencia de publicación.

## Pruebas

```sh
pnpm test:account-export-b100-initiation
pnpm test:account-export-b86-s3-loopback
pnpm test:account-lifecycle-contract
```

Se ejecutaron 9/9 tests aislados en Node22 sobre blobs exactos por hash de GitHub (incluido TCP local); tsc aislado de los helpers PASS. Se agregaron vectores Node de validación/overflow/UTF-8 y TCP local `127.0.0.1`; casos Jest del writer y del HTTP firmado del adaptador (fallas sintéticas B100); guard estructural B100, scripts y runbook.

**Evidencia pendiente:** ejecutar comandos en un checkout Node 24/pnpm 9, Jest/TypeScript/lint, suite SigV4 HTTP completa, Mongo replica real B94, proveedor real S3 con bucket/credenciales/lifecycle verificados, navegador, backups e IAM, auditorías #133/#141. Toda verificación pura o estática se reporta separada de esos gates.

**Release #353 OPEN/HOLD; STUDY_PROGRESS_ENABLED=false. No CI manual ni deploy.**
