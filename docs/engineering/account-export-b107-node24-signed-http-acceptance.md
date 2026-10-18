# B107 — Aceptación S3 firmada con Node 24 y prueba TAP verificable

**Base:** `main@4eb289f14eda0b33d8f9a77307b452de72221a99` (B106).
**Lanzamiento:** #353 OPEN/HOLD, `STUDY_PROGRESS_ENABLED=false` en producción.
**Prohibido:** despliegue y CI manual como atajo de aceptación.

## Problema confirmado

La batería S3 B86–B106 ya contiene 34 escenarios con peticiones TCP
locales firmadas SigV4. El ejecutor B101 aceptaba Node22 como modo de
diagnóstico y finalizaba **con exit 0** cuando todos pasaban, incluso
ejecutando el mismo comando empleado por una persona para calificar
el release. Su leyenda decía diagnóstico, pero el código de salida
no permitía diferenciar aceptación productiva de una ejecución
exploratoria.

El validador de TAP comprobaba los nombres esperados, su cantidad,
el resumen `# tests/# pass` y el exit code, pero **no validaba**
el plan superior `1..N`, el orden de los subtests ni que cada
`ok N - nombre` tuviera numeración continua. Un log artificial,
truncado o reordenado podía superar sus controles anteriores con
un resumen aparentemente exitoso.

## Corrección real de la calificación

1. El runner `scripts/run-account-export-b101-signed-http.mjs`
   considera **aceptación** solamente el runtime **Node 24** y
   **sin argumentos**. Rechaza Node22 con código 2 antes de lanzar
   la suite S3. `scripts/testing/b107-node-gate.mjs` encapsula
   y permite probar esa política sin depender de Node24 instalado.
2. Quien desee diagnosticar en Node22 debe optar explícitamente por
   `--diagnostic-node22`. Aun con 34/34 resultados positivos, su
   salida dice **NOT release acceptance**. No hay bypass vía
   variables de entorno. Otros runtimes y banderas no reconocidas
   fallan.
3. `scripts/testing/b101-signed-http-tap.mjs` exige una única
   cabecera `TAP version 13`, un único plan superior `1..N`
   idéntico al inventario, cada `# Subtest` en el orden esperado,
   y una única línea `ok 1...ok N` en orden, con su nombre exacto.
   Rechaza resultados `not ok`, skips, TODO, cancelaciones,
   fallos y resúmenes ausentes o inconsistentes.
4. Se conservan **todas** las protecciones previas: 34 escenarios
   B86–B106 con firma SigV4 independiente B87, 127.0.0.1,
   rechazo de `STUDY_PROGRESS_ENABLED=true`, verificación de
   no eliminar objetos privados sin autoridad y límites de lectura.
5. Se añaden dos suites nativas de `node:test`, independientes de
   Nest y S3 real: **8 tests TAP** (incluyen múltiples mutaciones
   negativas) y **5 tests de política de runtime**.

## Comandos de operación

```bash
# Comprobaciones TAP/runtime: ejecutables en Node22 o Node24
pnpm test:account-export-b107-contract

# ACEPTACIÓN DEL HTTP S3 FIRMADO COMPLETO: Node24 obligatorio
pnpm test:account-export-b107-release-acceptance

# Diagnóstico explícito en Node22: no habilita producción
pnpm test:account-export-signed-http-diagnostic-node22

# Contratos previos y B107, sin cambiar flag del lanzamiento
pnpm test:account-lifecycle-contract
```

Todos los comandos de prueba mantienen `[skip ci]` en commits
relacionados con este bloque; no se disparó una ejecución de Actions.

## Evidencia obtenida / evidencia aún no obtenida

- Se ejecutó la suite TAP B107 en **Node22.16.0** real,
  sobre los archivos locales cuyo **Git blob SHA coincidió**
  con el de la rama GitHub: TAP parser
  `3bdadfeb5d68d131f418f271dd30686648f7a160`,
  prueba `a6d34a80341809bf9147e9956f515b636c83f624`.
  Resultado: **8/8 tests nativos PASS**, ninguno omitido.
- La nueva suite runtime verifica Node24/Node22 en forma pura
  y dispone de pruebas de proceso para el rechazo previo a spawn.
  Su ejecución efectiva se registra aparte de TAP.
- Este entorno tiene Node22, **sin checkout del repositorio,
  sin pnpm9 y sin salida de red directa hacia GitHub**.
  Se pudieron recuperar fuentes del repo mediante el conector
  GitHub y ejecutar unidades aisladas; **no se ejecutaron**
  34 escenarios TCP SigV4 con el adaptador original en Node24,
  ni Jest/Nest, typecheck/lint, Mongo B94 o proveedor AWS/MinIO.

El módulo B107 hace imposible que el **comando de aceptación**
declare éxito bajo Node22; no reemplaza la aceptación pendiente.
Requiere checkout Node24/pnpm9, suite de 34 escenarios sin skips,
Jest, Mongo replica B94, AWS/MinIO IAM/lifecycle, backups y
auditorías #133/#141 antes de cualquier GO.

**Issue #353 permanece OPEN/HOLD.**

## Verificación nativa ampliada B101 + B107

Además se recuperaron literalmente y cotejaron por Git blob SHA
el resolver B101
(`d82804f4cad1e9083dd931c8179358f978a81982`) y su test de carga
(`5e14e681490978237d8e1ddb68a1f23f990ae746`).
Se creó un árbol local mínimo, con archivos TypeScript vacíos
solo para que el test de existencia/resolución del loader encuentre
los dos módulos esperados, y con un inventario S3 sintético de 34
nombres únicamente para probar que el runner rechaza Node22
**antes de iniciar los tests HTTP**.

Ejecutadas juntas por el runner real de `node:test` en Node22.16.0:

- B101: cinco tests originales de TAP/resolver.
- B107: ocho tests nuevos de TAP.
- B107: cinco tests nuevos de Node24/Node22 runtime y preflight.

**Resultado 18/18 PASS, 0 failed, 0 cancelled, 0 skipped, 0 todo.**
El código de parser, gate, runner y tests es byte a byte
idéntico a sus blobs de GitHub; los dos archivos TS auxiliares
son marcadores vacíos, **no el código de producción**.
No confundir esta prueba aislada con ejecutar la suite TCP SigV4
real o con validación Node24.
