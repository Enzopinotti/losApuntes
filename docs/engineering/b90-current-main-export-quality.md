# B90 — Tests de Account Export adaptados al main B114

**Fecha de referencia:** 18 de octubre de 2026.

## Fuente autoritativa y decisión de integración

El `main` del repositorio estaba en `a228183ad557e0b3114d983a06d84e1bf463d672` (B114, integridad de GET S3 y propagación de cancelación). El carrier histórico B89 [PR #407](https://github.com/Enzopinotti/losApuntes/pull/407) había saneado dos suites sobre una rama apilada **de octubre 16**, pero hoy contiene miles de líneas y escenarios diferentes a los del `main`. No se copió ningún archivo histórico completo ni se intentó fusionar las ramas #399/#403/#404/#407.

B90 parte directamente del `main` B114 y modifica cinco suites preexistentes, una CI de solo lectura y este contrato. Las protecciones productivas B90–B114 de S3, upload/download, Mongo destino local, aislamiento de propietarios y verificación SigV4 permanecen intactas.

## Mejoras de tipado sobre pruebas del main

1. **Account Export Processor:** conservar cinco aserciones de fecha `expect.any(Date)` y dos resultados `expect.objectContaining` para v2 (31 secciones) y v3 (32). Como la firma de Jest devuelve `any`, los predicados se tipan en variables `unknown` sin alterar su semántica de comparación.
2. Las **193 aserciones** de métodos Jest presentes en este `main` se reescribieron a observación de `mock.calls` con el mismo significado: **118 casos sin invocación, 34 cantidades exactas, 38 verificaciones de argumentos y 3 invocaciones positivas**. No se elimina ningún test ni se relajan expectativas de privacidad, reloj o eliminación S3.
3. **Mongo orphan cleanup store:** los dobles `updateOne` y `deleteOne` ahora aceptan tuplas `unknown`, manteniendo `mockReturnValueOnce` de inserción, respuestas posteriores y filtros originales, para evitar que `mock.calls` propague `any[]`.
4. **Mongo Account Export Store:** los mocks de escritura declaran tuplas tipadas de filtro/update/opciones y el test de recuperación valida en runtime el documento `$setOnInsert` y sus fechas antes de calcular el horizonte. Corrige TS2352/TS2493 sin permitir que un payload corrupto pase silenciosamente.
5. **Study Progress Export Reader:** el fixture negativo usa `plan: unknown` para representar documentos de Mongo malformados sin cambiar el contrato productivo del plan.
6. **Account Export Controller B92:** la tabla `it.each` de cambios de generación/tamaño/digest/versión se tipa explícitamente para conservar los cuatro casos de rechazo HTTP 409 y evitar la inferencia de callbacks con tuplas disjuntas (TS2345).
7. Se formatearon únicamente esos cinco archivos con las herramientas existentes (`.nvmrc`, `pnpm install --frozen-lockfile`, Prettier fijado), en una rama auxiliar con permiso de escritura **exclusivamente sobre ella**. [Ejecución de formato #39130517722](https://github.com/Enzopinotti/losApuntes/actions/runs/39130517722): SUCCESS. El workflow temporal no forma parte de este PR.

## Recuperación del typecheck B114

La primera CI del B90 detectó cinco errores **preexistentes fuera de los dos archivos de lint originales**: cuatro errores en la firma de mocks Mongo y el fixture de plan persistido, más un TS2345 en la matriz B92 de descarga. Los tres cambios de fuente añadidos son exclusivos de pruebas y preservan los casos de corrupción, autorización, cancelación y revalidación de generación.

La rama auxiliar con permisos de escritura solo generó Prettier (sin scripts productivos nuevos ni cambios al runtime). Los resultados definitivos deben tomarse del último SHA de esta PR; un éxito focal no acredita la auditoría ni la integración real Mongo/S3.

## Gates

La CI de solo lectura `b90-export-current-main-quality.yml` valida el SHA exacto de la PR, Prettier y ESLint estricto de los cinco fixtures, Jest completo de sus suites y `check:types` global API **como job independiente**. El workflow `verify` sigue siendo la validación global obligatoria.

Las cifras **47 errores de ESLint** y **1314 tests** corresponden a B89 en una rama histórica, **no** al `main` B114. Deben reportarse separadamente los resultados actuales. Una verificación focal verde no es release readiness, y las pruebas de Mongo/S3 reales requieren un entorno aislado explícitamente autorizado.

**Seguridad y release:** sin bypass de auditoría, extensiones automáticas de excepciones, `eslint-disable`, cambios de flags ni activación del formato de exportación. [Issue #353](https://github.com/Enzopinotti/losApuntes/issues/353): HOLD. No merge a `main`, producción ni despliegue mientras los gates completos o auditoría continúen fallando.
