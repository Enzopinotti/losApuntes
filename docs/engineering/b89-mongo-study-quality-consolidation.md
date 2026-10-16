# B89 — Consolidación exact-head de calidad API y aceptación Mongo

**Fecha:** 2026-10-16. **Base de calidad:** [B88 #405](https://github.com/Enzopinotti/losApuntes/pull/405) `9f8a4266d185db0f61647de9e577519b5810fc98`, cuya base B87 [#402](https://github.com/Enzopinotti/losApuntes/pull/402) integra B86 [#399](https://github.com/Enzopinotti/losApuntes/pull/399). La alternativa [#403](https://github.com/Enzopinotti/losApuntes/pull/403) aporta el mismo formateo completo, pero B89 no fusiona ambos carriers.

## Solapamiento detectado y resuelto sin pisar fuentes

El carril paralelo [#404](https://github.com/Enzopinotti/losApuntes/pull/404) ya corrigió los dos tests Mongo grandes y un guard de lectura de código. En lugar de reescribir esos tests, se verificó **SHA de blob exacto** para cada uno de los tres archivos frente a la base de #404 y al HEAD de #405. Los tres blobs base coincidían byte a byte.

Se importaron **solo los tres blobs modificados**, desde #404 `d1a118bbb2a3be37cf127d87b6c40a07932fd783`:

- `study-collection-lifecycle.mongo-int.spec.ts` — tipado de mocks, propietario y documentos no confiables, conservación de pruebas de CAS.
- `study-progress.mongo-int.spec.ts` — mocks y pruebas de respuesta S3 tipados, preservando las regresiones incorporadas B82–B86 (multipart ACK, recuperación de huérfanos y error 503).
- `scripts/test-account-export-b86-guard.mjs` — tolera la disposición de espacios Prettier pero mantiene los valores exactos del oráculo de reintentos, generación y retención.

Por separado se conservaron íntegros los ocho archivos de #405: guardias fail-closed, plan privado, lectores owner-only, versionado v3 y los mocks tipados de `AccountExportService` (42 casos originales; sin cambios del servicio de producción). **No** se importó ninguna versión antigua del processor, stores Mongo, adaptadores S3, ni se sustituyó el formato completo API.

## Validación real versus gates de sólo código

El nuevo workflow `B89 combined strict Mongo and Study quality` es de **solo lectura**, checkout de SHA exacto, Node 24 y pnpm frozen. Tiene tres jobs independientes:

1. ESLint `--max-warnings=0` de los **diez** archivos API del conjunto B88+B89 y Prettier completo API.
2. TypeScript completo API, **siete** suites Jest normales de versión/exportación/estudio, los **dos archivos de aceptación Mongo** como suites explícitas, guards B83/B84/B85/B86 y los tests del parser local de URI para Mongo.
3. ESLint estricto de toda API como control **obligatorio**, sin ignorar los problemas fuera del alcance.

**Importante:** las dos suites de integración Mongo se ejecutan solamente ante un opt-in local permitido, con réplica aislada validada. En GitHub Actions, sin URI local autorizada, sus tests aparecerán como `skipped`. Esto **no** comprueba comportamiento contra Mongo real ni autoriza levantar Mongo en CI. Las pruebas estructurales tampoco sustituyen al servicio real.

## Integración con main, calidad y liberación

Mientras se construía B89, `main` avanzó 11 commits desde `ce9385456904fcd38f5e5a81509013d1a46c17bd`, agregando el runner de aceptación Mongo B89, controles de URI y documentación operacional. La comparación Git detectó **cero archivos superpuestos** con los archivos modificados por este carrier. B89 incorpora esos commits con un merge de dos padres cuyo árbol base es el `main` real, reteniendo cada blob B89 previamente confirmado. Los resultados de CI anteriores siguen siendo históricos hasta recertificar el SHA combinado.

Release [#353](https://github.com/Enzopinotti/losApuntes/issues/353) **HOLD**. No modificar `ACCOUNT_EXPORT_FORMAT_VERSION=1` ni habilitar Study Progress, permisos, reglas lint o excepciones vencidas. Auditoría #133/#141 independiente. **Sin merge a main, sin arranque de API/Web/Mongo ni despliegue.**
