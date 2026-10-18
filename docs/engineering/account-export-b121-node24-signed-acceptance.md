# B121 — Ejecución exact-head de las 61 pruebas S3 firmadas en Node 24

**Base inicial:** `main@639f4c2fad56b14a4e219a386e3554dc4187214c` (B120).
**Estado de producción:** issue #353 `OPEN/HOLD`,
`STUDY_PROGRESS_ENABLED=false`. Esta verificación **no despliega**,
no modifica los datos ni eleva el flag.

## Brecha real

B120 dejó 61 escenarios TCP firmados de S3 y comprobaciones locales
Node22 de helpers, pero no hay evidencia ejecutada del conjunto completo
en el runtime productivo Node24. Los source guards y el inventario de
test names no garantizan que el adaptador pueda completar la batería
sobre sockets reales y que su TAP resulte positivo.

## Verificación nueva

`.github/workflows/b121-signed-http-node24.yml` es una tarea
**solo lectura, automática exclusivamente en PRs relacionados**;
no expone `workflow_dispatch` ni ninguna acción de despliegue.

- GitHub Actions `ubuntu-24.04`, setup Node desde `.nvmrc`
  (Node24), verificación explícita de versión.
- Checkout del `pull_request.head.sha` *exacto*, con credenciales Git
  no persistentes y permiso `contents: read` exclusivamente.
- Checks de worktree limpio antes y después, sin merges temporales,
  sin materializar cloud S3, sin variables de credenciales S3 reales.
- Ejecuta los tests nativos de política Node24, TAP/orden/sin skips,
  verificación SigV4 B87, el contrato B120 y su guard.
- Después llama **directamente al ejecutor real**
  `scripts/run-account-export-b101-signed-http.mjs`, que inicia
  sockets locales `127.0.0.1:0` con firma criptográfica
  independiente y comprueba el TAP completo: **61 casos,
  61 PASS, 0 skips, 0 TODO, 0 fails**.
- **Sin `pnpm install` ni dependencia de Mongo/S3 externos:** toda
  la suite firmada B86–B120 es autosuficiente con Node24 y el resolver
  TS local versionado. Esto evita confundir errores históricos de
  linters con el objetivo de aceptación de S3.

## Qué evidencia permite y qué no

Una corrida positiva verifica el contrato firmado contra la fixture
localhost sobre un **SHA exacto**, no la compatibilidad con AWS S3 o
MinIO, ni el circuito Mongo réplicas, ni la aceptabilidad productiva
de Study Progress. Si cualquier paso falla, el job falla: no se
registra un PASS ni se cambia ningún release gate.

Para ver el resultado real: inspeccionar el job
**Signed local S3 TCP 61/61 on Node24**, su SHA asociado, sus logs y
el mensaje `B107 Node24 qualified signed HTTP PASS: 61/61`.

**Pendiente en #353:** Jest/Nest completo, Mongo B94 con réplica,
proveedor S3 real/MinIO y políticas IAM/lifecycle, backup/restore,
navegador multiusuario, calidad general y auditorías #133/#141.

No levantar `validateRuntimeEnvironment`, no habilitar
`STUDY_PROGRESS_ENABLED=true` en producción.

## Ejecuciones de aceptación verificadas en GitHub Actions

Evidencia del job de solo lectura **B121 Node24 signed S3 HTTP acceptance**
en el PR #442 (solo fixtures locales; no AWS/MinIO externo):

- **Run #39147247683**, primer intento sobre
  `cddb3a5f207df36e4ef9a6041e464b0971685ebc`:
  **57 PASS / 4 FAIL**. Tres aserciones de lectura comparaban
  `Uint8Array` con `Buffer` aun con los mismos bytes; la aserción
  multipart B112 omitía `content-type` entre los SignedHeaders
  aunque SigV4 se verificaba criptográficamente. Ningún test de
  seguridad de producción se eliminó ni se relajó.
- **Run #39147332300**, después de corregir esas cuatro expectativas,
  sobre `ee40c4749b24477da520ec243ce79da9f1bf33b8`:
  **61 PASS / 0 FAIL / 0 SKIP / 0 TODO**, pero el wrapper B107
  *correctamente rechazó* la evidencia porque Node24 produjo el
  reporter interactivo `spec` y el verificador exige TAP v13.
  Esto era un defecto de orquestación, no un pase de release.
- **Run #39147403904**, sobre
  `bcc47011e71cafdfc33ad0e55cc3584f7ad25408`:
  se fijó `--test-reporter=tap` en el subprocess real. Job
  **SUCCESS**, con `TAP version 13`, plan `1..61`,
  `# tests 61`, `# pass 61`, `# fail 0`,
  `# cancelled 0`, `# skipped 0`, `# todo 0`,
  y confirmación del wrapper
  `B107 Node24 qualified signed HTTP PASS: 61/61`.
  El job validó SHA exacto y worktree limpio antes y después.

Se agregó un control a B107 para exigir explícitamente
`--test-reporter=tap` y evitar que la omisión reaparezca.
**El SHA finalmente integrado debe compararse con el candidato
probado** y las futuras modificaciones exigen ejecución propia,
no reutilizar el PASS de un SHA anterior.

Estas pruebas confirmaron funcionamiento real del **adaptador S3
original contra un servidor localhost firmado e independiente**.
No confirman AWS S3 externo, Mongo replica, backups, navegador,
dependencias vulnerables o configuración operativa productiva.
Issue **#353 HOLD** permanece obligatoria.
