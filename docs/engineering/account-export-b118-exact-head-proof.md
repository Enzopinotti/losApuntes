# B118 — Prueba local reproducible de 57 solicitudes S3 firmadas

**Baseline de partida:** `main@cc8f37c7f231ae8d9cd643cd03f8398ce34e3030` (B117).  
**Estado de release:** issue #353 `OPEN/HOLD`, Study Progress deshabilitado en producción.

## Qué problema resuelve

Los bloques B86–B117 dejaron una batería de 57 escenarios HTTP localhost con
validación SigV4, separación de datos privados y TAP anti-omisión, pero los
comandos de prueba no producían un registro compacto que permitiera asociar
la ejecución al SHA exacto y a las fuentes probadas. Un run viejo, Node22
en modo diagnóstico, checkout modificado o texto de pruebas incompleto
no puede certificar la aceptación.

B118 agrega un **ejecutor local de evidencia**. No cambia API, Web, dominio,
autorización, almacenamiento, flags productivos ni el runner firmado B107.

## Comandos

En un checkout completo, limpio, con **Node 24 y pnpm 9.15.9**, recuperar
el SHA exacto mediante `git rev-parse HEAD`. Luego:

```sh
pnpm test:account-export-b118-contract
node scripts/run-account-export-b118-local-proof.mjs --expected-sha=<SHA_EXACTO_DE_40_HEX>
```

El segundo comando requiere reemplazar el placeholder por el SHA real
de 40 caracteres hexadecimales. No usar `main`, `HEAD`, un SHA parcial
ni el SHA anterior a una modificación.

## Secuencia de verificación

1. Validación de un único argumento `--expected-sha` de 40 caracteres.
2. Check de `git rev-parse HEAD` y `git status --porcelain` vacío, incluso
   archivos no trackeados, para evitar certificar un checkout distinto.
3. Verifica versión Node 24, pnpm 9.15.9, flag de Study Progress apagado y
   57 test names únicos incluyendo 4 B117.
4. Calcula hashes SHA256 de la suite real y del runner.
5. Ejecuta **sin filtros** el ejecutor original
   `run-account-export-b101-signed-http.mjs`: éste usa sockets TCP locales
   contra el adaptador real, verificación criptográfica B87, y exige plan
   y resumen TAP 57/57 con cero failures, skips, cancelled o TODO.
6. Requiere además el marker único y exacto de aceptación Node24 del
   ejecutor original. Node22 diagnóstico jamás califica.
7. Revalida el HEAD, la limpieza del worktree y los hashes de archivos,
   descartando una ejecución durante la cual hayan cambiado fuentes.
8. **Solo en éxito** escribe JSON mínimo bajo un directorio temporal privado
   `losapuntes-b118-proof-*`, con permisos de creación `0600` donde
   el sistema operativo lo respeta. El mensaje final muestra la ruta.

El registro contiene SHA de commit, versiones runtime, hashes del inventario,
runner y TAP, conteo exacto, timestamp y `releaseGate: HOLD`. **No conserva**
stdout, cookies, contraseñas, requests firmados, object keys ni material
de exportaciones de terceros. Su SHA del TAP permite comprobar procedencia
del stdout local si se conserva externamente, pero **no** prueba S3 externo.

## Validaciones y límites

`pnpm test:account-export-b118-contract` ejecuta tests nativos puros y
source guard que detectan regresiones obvias de la política de prueba.
Estos tests son compatibles con Node22 como diagnóstico de lógica pura,
pero **no** califican la batería HTTP.

El comando real de evidencia termina en fallo sin JSON si no está Node24,
el checkout está sucio, faltan pruebas, hay signal/timeout, falla la firma,
hay tests omitidos, el TAP no concuerda o el resultado no es 57/57.
El launcher no dispara GitHub Actions, no despliega y no envía datos a red
remota: los únicos requests HTTP los hace el runner firmado a 127.0.0.1.

**No ejecutado aquí:** los 57 casos TCP con Node24/pnpm9 sobre un checkout
completo. No afirmar `GO` por agregar un ejecutor o superar sus tests nativos.

Continúan pendientes Jest/Nest completo, Mongo replica B94, S3/MinIO externo
con IAM/lifecycle, backup/restore, browser multiusuario y auditorías #133/#141.
No alterar `validateRuntimeEnvironment`, no levantar #353 ni habilitar
`STUDY_PROGRESS_ENABLED=true` en producción.
