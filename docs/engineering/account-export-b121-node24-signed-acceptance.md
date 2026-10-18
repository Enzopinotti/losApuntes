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
