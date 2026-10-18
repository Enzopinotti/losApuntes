# B90 — Tests de Account Export adaptados al main B114

**Fecha de referencia:** 18 de octubre de 2026.

## Fuente autoritativa y decisión de integración

El `main` del repositorio estaba en `a228183ad557e0b3114d983a06d84e1bf463d672` (B114, integridad de GET S3 y propagación de cancelación). El carrier histórico B89 [PR #407](https://github.com/Enzopinotti/losApuntes/pull/407) había saneado dos suites sobre una rama apilada **de octubre 16**, pero hoy contiene miles de líneas y escenarios diferentes a los del `main`. No se copió ningún archivo histórico completo ni se intentó fusionar las ramas #399/#403/#404/#407.

B90 parte directamente del `main` B114 y modifica únicamente dos suites preexistentes, una CI de solo lectura y este contrato. Las protecciones productivas B90–B114 de S3, upload/download, Mongo destino local, aislamiento de propietarios y verificación SigV4 permanecen intactas.

## Mejoras de tipado sobre pruebas del main

1. **Account Export Processor:** conservar cinco aserciones de fecha `expect.any(Date)` y dos resultados `expect.objectContaining` para v2 (31 secciones) y v3 (32). Como la firma de Jest devuelve `any`, los predicados se tipan en variables `unknown` sin alterar su semántica de comparación.
2. Las **193 aserciones** de métodos Jest presentes en este `main` se reescribieron a observación de `mock.calls` con el mismo significado: **118 casos sin invocación, 34 cantidades exactas, 38 verificaciones de argumentos y 3 invocaciones positivas**. No se elimina ningún test ni se relajan expectativas de privacidad, reloj o eliminación S3.
3. **Mongo orphan cleanup store:** los dobles `updateOne` y `deleteOne` ahora aceptan tuplas `unknown`, manteniendo `mockReturnValueOnce` de inserción, respuestas posteriores y filtros originales, para evitar que `mock.calls` propague `any[]`.
4. Se formatearon únicamente esos dos archivos con las herramientas existentes (`.nvmrc`, `pnpm install --frozen-lockfile`, Prettier fijado), en una rama auxiliar con permiso de escritura **exclusivamente sobre ella**. [Ejecución de formato #39130517722](https://github.com/Enzopinotti/losApuntes/actions/runs/39130517722): SUCCESS. El workflow temporal no forma parte de este PR.

## Gates

La CI de solo lectura `b90-export-current-main-quality.yml` valida el SHA exacto de la PR, Prettier y ESLint estricto de los dos fixtures, Jest completo de esas suites y `check:types` global API **como job independiente**. El workflow `verify` sigue siendo la validación global obligatoria.

Las cifras **47 errores de ESLint** y **1314 tests** corresponden a B89 en una rama histórica, **no** al `main` B114. Deben reportarse separadamente los resultados actuales. Una verificación focal verde no es release readiness, y las pruebas de Mongo/S3 reales requieren un entorno aislado explícitamente autorizado.

**Seguridad y release:** sin bypass de auditoría, extensiones automáticas de excepciones, `eslint-disable`, cambios de flags ni activación del formato de exportación. [Issue #353](https://github.com/Enzopinotti/losApuntes/issues/353): HOLD. No merge a `main`, producción ni despliegue mientras los gates completos o auditoría continúen fallando.
