# Bloque B58 — Consolidación de práctica enfocada y tests de exportación

## Origen y conciliación de PR paralelos

Con el `main` posterior al B57, se revisaron los PR en borrador:

- **#341**: modo «Practicar esta pregunta» desde la Mesa de estudio.
- **#342**: un error de literal de cadena en
  `account-export.service.spec.ts`.
- **#344**: baseline de formato, con archivos Web que también contienen
  mejoras nuevas de B55–B57. No es seguro copiar su código completo sobre
  `main` ni importar su workflow sin una revisión específica.

B58 porta **los siete archivos no relacionados con CI de #341**, conserva
la ruta y los permisos previos y agrega una salida segura de foco. Además
incorpora el único cambio fuente de #342. Sus workflows nuevos quedan
fuera del bloque, conforme a la política actual `[skip ci]`.

## Funcionalidad

1. La Mesa de estudio muestra «Practicar esta pregunta» en cada pregunta
   visible con IDs válidos de materia y pregunta.
2. Se construye `/study/practice?subjectId=...&questionId=...`.
   Duplicados o identificadores malformados no se convierten silenciosamente
   en una selección general.
3. Al abrir, se exige sesión autenticada y materia perteneciente al
   contexto académico actual. Se vuelve a consultar la pregunta con la API;
   solo se acepta si su ID y materia coinciden con el enlace.
4. La pantalla muestra únicamente título/enunciado para preparar una ronda
   de **una sola pregunta**. No se presentan respuestas antes de la
   revelación explícita ya protegida por la API.
5. Tickets de autoridad asíncrona atan la consulta a cuenta, sesión, materia
   y foco; navegar a otro foco no reutiliza una ronda anterior.
6. Si la consulta falla o la pregunta cambió, se puede reintentar o
   elegir otra; el enlace para quitar el foco vuelve al recorrido normal
   de preguntas de la materia.

La funcionalidad no crea permisos, calificaciones, notas persistidas,
endpoints ni grants. La integración tampoco habilita Colecciones, que
continúan apagadas por defecto.

## QA disponible / pendiente

```sh
node scripts/test-web-focused-practice-contract.mjs
node scripts/test-web-study-practice-integration.mjs
node scripts/test-b58-focus-export-reconciliation.mjs
node scripts/test-b51-study-export-consolidation.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web build
pnpm --filter @losapuntes/api exec jest --runInBand --runTestsByPath src/data-lifecycle/domain/account-export.service.spec.ts
```

Los controles aislados de fuente y del helper JS son útiles para detectar
regresiones. **No sustituyen** TypeScript/Jest ni aceptación E2E con navegador.
Quedan pendientes probar otra cuenta, otra materia, respuesta eliminada,
permisos revocados, foco inválido/repetido, respuesta visible solo tras
revelación, y continuidad hacia el Planificador.

## Integridad con B57 y PRs abiertos

B58 no toca el módulo de persistencia, Mongo, la API ni los archivos Web de
recuperación B56/B57. Conserva el `expectedRevision` de la limpieza y el
backend desactivado por defecto.

El PR **#344** incorpora una revisión de formato de `StudyPractice` y
`StudyWorkbench` sobre una base antigua; requiere nueva conciliación de su
diff antes de fusionarlo. Los borradores **#341 y #342** deben marcarse como
superados en sus respectivos carriles luego de corroborar la integración de
sus cambios efectivos en B58. Ninguno de sus workflows fue copiado.

Sin ejecución de CI ni afirmaciones de que las pruebas reales han aprobado.
