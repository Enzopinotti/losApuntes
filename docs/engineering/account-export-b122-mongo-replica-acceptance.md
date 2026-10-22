# B122 — Ejecución de aceptación Mongo real y recuperación de exportaciones privadas

**Base:** `main@b2150e6e2702fd15539a0f1ff324dda0b83dafcc` (B121).  
**Producción:** `#353 OPEN/HOLD`, `STUDY_PROGRESS_ENABLED=false`.

## Problema y objetivo

El bloque B121 obtuvo por primera vez aceptación Node24 con **61/61
HTTP TCP S3 firmados**. El contrato B94 de la aplicación ya exigía cinco
casos Mongo transaccionales B86/B90/B93 para recuperar generaciones
privadas y proteger el reloj del Mongo primario, pero no contábamos
con un resultado de ejecución real en una réplica Node24 sobre
un checkout reproducible.

La aceptación B122 **no cambia el código productivo** y deja intactos
los PR de calidad #437/#434, las autorizaciones de propietarios y el
bloqueo de lanzamiento.

## Job de integración focalizado

`.github/workflows/b122-mongo-replica-acceptance.yml` ejecuta, al
abrir/actualizar PRs relevantes, una prueba de aceptación aislada:

1. Checkout exacto de `pull_request.head.sha` y comprobación de
   `git rev-parse HEAD`, árbol sin cambios y `contents: read`.
2. Node24 desde `.nvmrc`, pnpm9 y `pnpm install --frozen-lockfile`.
   Sin manipular `pnpm-lock.yaml` ni levantar feature flags.
3. Ejecuta las pruebas nativas B89 de URI y B94 de inventario/
   verificación de reporte, más el guard fuente existente.
4. Levanta **una instancia MongoDB 7 desechable**, puerto
   exclusivamente `127.0.0.1:27017`, `--replSet rs0`. Inicializa
   `rs.initiate` y espera `hello.isWritablePrimary === true`.
   No hay auth por diseño **solo en el contenedor efímero local**,
   ni Mongo Atlas, secretos o hosts ajenos.
5. Corre el ejecutor original
   `node scripts/run-account-export-b86-local-acceptance.mjs`
   con `STUDY_PROGRESS_TEST_MONGO_URI=
   mongodb://127.0.0.1:27017/?replicaSet=rs0` y el flag apagado.
   B89 verifica una IP de loopback y fuerza conexión directa.
6. El ejecutor filtra y exige exactamente **5 aserciones Jest PASSED**
   y su reporte JSON íntegro: B86 (2), B90 (1), B93 (2). Fallos,
   skips, tests ausentes o aserciones renombradas hacen fallar el job.
7. Se comprueba nuevamente el SHA/worktree. El contenedor se elimina
   **también si falla** la ejecución.

## Alcance verificable de los cinco casos

- B86: reconciliación de PUT privado con ACK perdido y recuperación
  owner-fenced por Mongo con retry de limpieza tras DELETE 503.
- B86: generación publicada que no puede ser eliminada por una
  recuperación huérfana.
- B90: GET S3 del mismo tamaño pero corrupto que no se publica y
  conserva la intención de recuperación.
- B93: validación de artifact futuro con reloj Mongo primario.
- B93: negativa de acceso a generaciones vencidas o desacopladas.

Los casos usan el **MongoDB real del contenedor** y el adaptador
S3 de aplicación con transporte HTTP **simulado en Jest**. No
constituyen pruebas con AWS S3/MinIO remoto ni equivalen a 61/61
TCP firmados (estos fueron aprobados por B121 de manera separada).

## Criterio de evidencia y restricciones

El resultado positivo requiere GitHub Actions **SUCCESS** en el
SHA exacto, log de Jest y la confirmación literal
`B94 local Mongo/S3 acceptance PASS: 5/5 mandatory cases executed.`
Si aparece una falla real, corregirla sin falsificar datos ni
desactivar checks. El job no tiene `workflow_dispatch`, permisos de
escritura, despliegues, Mongo persistente ni credenciales productivas.

**No habilitar Study Progress ni cerrar #353** por aprobar esta
prueba. Restan calidad global del repo, pruebas navegador,
proveedor S3 real e IAM/lifecycle, backups/restauración,
auditorías #133/#141 y demás gates de liberación.

## Evidencia ejecutada — primera corrida real

El job `Five real Mongo replica and mocked S3 recovery cases`
terminó **SUCCESS** en la
[ejecución #39149219803](https://github.com/Enzopinotti/losApuntes/actions/runs/39149219803),
sobre el PR #443 y el commit
`e6ff296d05d8801fcb7a7083f462973501e4c838`.

- Node 24 desde `.nvmrc`; pnpm9 y frozen lockfile instalados.
- Las pruebas nativas B89 de URL local y el contrato B94 se
  ejecutaron; **9/9 guards B94 PASS**.
- MongoDB 7 se levantó como una réplica desechable `rs0`
  en `127.0.0.1:27017`, con
  `hello.isWritablePrimary=true`.
- Jest sobre `study-progress.mongo-int.spec.ts`:
  `Test Suites: 1 passed, 1 total` y
  `Tests: 51 skipped, 5 passed, 56 total`.
  **Los 51 skipped eran pruebas no seleccionadas
  intencionalmente por B94**; ninguna de las cinco seleccionadas
  fue skipped ni falló.
- Comprobante estricto:
  `B94 local Mongo/S3 acceptance PASS: 5/5 mandatory cases executed.`.
- Verificación de checkout limpio, SHA exacto y retirada
  del contenedor pasaron después de Jest.

El resultado prueba un MongoDB **real**, una réplica única
local y lógica real de la API en Jest. El transporte S3 está
simulado en los cinco casos de B94. No afirmar que la prueba
incluya proveedor S3 real ni que reemplace el laboratorio
HTTP firmado B121, que sí obtuvo 61/61 por separado.

Las modificaciones documentales posteriores al SHA indicado
no deben confundirse con una nueva ejecución: para certificar
el árbol definitivo del PR, verificar y registrar su propio run.
**#353 sigue OPEN/HOLD**, flag apagada en producción.
