# B124 — Reconciliación TypeScript de los tres fixtures bloqueantes

**Base:** `main@ef0ed1fcd56727588d7532b047da55f77f89f21c` (B123).  
**Release:** issue #353 `OPEN/HOLD`; `STUDY_PROGRESS_ENABLED=false` en producción.

## Qué falla en verify

En la corrida real `verify #39151853514`, las suites API compartidas
mostraron **3 suites fallidas** por errores `ts-jest` de los mismos
tres archivos: `account-export.controller.spec.ts` (`TS2345`),
`mongo-account-export.store.spec.ts` (`TS2352/TS2493`) y
`study-progress-export.reader.spec.ts` (`TS2353`).
La instalación Node24/pnpm9 funciona. B123 dejó 162/162 Jest PASS
en sus suites propias, y B121/B122 siguen pasando por separado.

Los PR de calidad #437/#434 ya proponen una reconciliación similar
pero parten de bases antiguas e incluyen otros cambios de fixtures;
el PR Q91 #445 formatea muchos archivos de API/Web. B124
**no reutiliza esos archivos completos** ni altera los contratos
productivos, el reporte de B94 o las 61 pruebas S3 firmadas.

## Correcciones limitadas a la semántica original

1. **B92, preflight de descarga:** cambia los datos de `it.each`
   de tuplas `[changes, dimension]` a objetos con `changes`
   y `field`. Jest recibe un único argumento con tipos
   correctos y conserva las cuatro variantes de corrupción
   `generation/size/digest/version`, 409 y prohibición de
   emitir bytes privados. Se mantiene el nombre descriptivo
   de cada dimensión en la salida del test.
2. **B80/B83 Mongo store:** los `jest.fn` de `updateOne` para
   job y orphan cleanup ahora registran una lista de argumentos
   `unknown[]`; así la inspección de sus llamadas no
   infiere `[]` (tupla de longitud cero) incorrectamente.
   Los mismos filtros, `$setOnInsert`, transacciones y reglas
   de expiración/lease se siguen verificando sin `any`,
   mocks parciales de producción ni eliminación de casos.
3. **B62 Study Progress reader:** una variable
   `malformedPlan` introduce deliberadamente el campo
   `unknownField` en una forma estructuralmente asignable
   a la fixture TypeScript. El dato inválido **sí se entrega
   al reader real**, que debe seguir rechazándolo; no se
   elimina la prueba negativa ni se cambia el validador.

## Evidencia de ejecución

El workflow de solo lectura
`.github/workflows/b124-export-fixture-acceptance.yml`
ejecuta **las tres suites Jest completas** en Node24 con
`ts-jest` real, dependencias `pnpm install --frozen-lockfile`,
`--detectOpenHandles`, `--passWithNoTests=false`,
SHA exacto y árbol limpio antes/después; sin disparador manual,
permisos de escritura o despliegue.

La corrección de formato global **no es parte de B124**:
Q91 #445 ya la está trabajando. La suite global `verify`
permanece un gate separado, incluido Prettier, lint, typecheck,
auditoría de dependencias con excepción vencida el
**2026-10-15**, otros tests, provider S3 real/IAM y restore.

## Límite de aprobación

Una aceptación focalizada valida el tipado real de esos tres
fixtures y sus tests, **no certifica** producción ni la
suite global. B121 y B122 son pruebas reales independientes
en otro nivel (61 TCP S3 firmados y cinco Mongo replica).

**No habilitar Study Progress ni cerrar #353.**
