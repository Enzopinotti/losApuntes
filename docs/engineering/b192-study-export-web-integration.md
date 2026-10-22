# B192 — Integración segura de Study Progress v3 con exportación Web de cuenta

**Estado:** PR Draft, no merge / no deploy. **Base verificada:** `main@bff19f4e493c348480794b9ff0a11c88c7949286` (2026-10-22).
**Origen técnico:** B191 [#540](https://github.com/Enzopinotti/losApuntes/pull/540), head `95f219d879cad1e963f7ced94ea4bcd958535197`.
**Acceptance release:** [#353](https://github.com/Enzopinotti/losApuntes/issues/353), supply chain #133/#141.

## Diagnóstico de main antes de tocar archivos

Desde `main@227172f` usado por B191, main avanzó **396 commits** y añadió calendario/agenda de estudio, Q&A, búsqueda y el panel privado de exportación desde Seguridad. Se compararon los blobs SHA de los seis archivos de Study Progress/contratos B61-B62: ninguno había sido cambiado por los otros carriles. Se trasladaron los archivos **exactos** desde #540 a una rama creada desde el main más reciente; cada update comprobó el blob esperado antes de escribir.

El lockfile de main **ya contiene el fix de follow-redirects@1.16.1** (blob `871ed919dd7e11b1c6d0c979b1627be4426e5ab6`) y el verificador de seguridad B190 ya existe en main. No se copió ni se modificó otra vez el lockfile, Web Search/Mobile, ni el checker. El script de regresiones de HTTP en main también tiene cambios posteriores al B191: se conserva su versión actual, más reciente. De este modo B192 no reemplaza 396 commits de terceros con un snapshot antiguo.

## Corrección de backend heredada (B187/B188/B191)

1. `StudyProgressExportReader` mantiene el filtro `ownerUserId`, la paginación canónica `subjectId` y el cursor ligado al dueño. Comprueba `limit+1`, orden ascendente, ausencias, duplicados, solapamientos y fechas imposibles; registros malformados abortan la exportación en vez de filtrar datos silenciosamente.
2. `StudyProgressService.get` vuelve a validar la sesión de estudio contra el parser cerrado v1, la materia, revisión y marcas de tiempo. Devuelve sólo la proyección propia y falla con código seguro `STUDY_PROGRESS_STORED_INVALID` cuando una fila persistida está corrupta.
3. Se conservaron las pruebas adversariales Jest y los contratos B61/B62 actuales que verifican relectura del servidor/revisión antes de reemplazar trabajo local y proyección explícita del documento Mongo.

**Invariante:** Account Export v1/v2 mantienen 30/31 secciones y v3 32 (`study.progress`); no se altera el orden/cursor de otras secciones, el CAS de escritura, el guard de cuenta activa, la eliminación al cerrar cuenta, ni la cuota de 16 materias.

## Nueva funcionalidad visible

El panel `Seguridad > Exportar mis datos` sigue detrás de `VITE_ACCOUNT_EXPORT_WEB_ENABLED=false` y con sesión autenticada. **Sólo cuando el backend informa formato v3, estado `completed` y `downloadable=true`** muestra una leyenda educativa: el archivo incluye el progreso de estudio propio, si existe, y no reproduce contenido de terceros ni concede permisos de materiales.

La leyenda no consulta recursos adicionales, no revela cuántas materias guardó el usuario, no muestra títulos/IDs, no reintenta operaciones ni altera el enlace de descarga. La descarga sigue siendo navegación nativa a endpoint autenticado, con `referrerPolicy=no-referrer`, sin Blob, signed URLs ni almacenamiento persistente en navegador. La validación real `parseAccountExportStatus` sigue aceptando estrictamente los formatos 1/2/3; no afirma que haya datos del usuario cuando el archivo está vacío.

## Verificación exact-head

El workflow `.github/workflows/b192-study-export-web-integration.yml` une pruebas previamente aprobadas y nuevas de integración:

- Node24 + pnpm9, `pnpm install --frozen-lockfile`, verificación de integridad oficial de npm y `follow-redirects`, 5 pruebas HTTP reales, Web TypeScript/build y Prettier de la interfaz tocada.
- `scripts/test-web-account-export-contract.mjs` + nuevo `scripts/test-b192-account-export-study-web.mjs`: formatos históricos, estados v3 válidos/forjados, gate Web, leyenda condicional, ausencia de descarga Blob/localStorage, manifiesto `study.progress` y proyección owner-scoped del backend.
- API ESLint/Prettier/TypeScript, 7 suites Jest, contratos B61/B62 sin rebajar controles y comprobación de SHA/árbol limpio.
- MongoDB 7 `rs0` real efímero sólo en loopback, mínimo 56 tests efectivos, cero omitidos, cierre de cuenta/exportación/paginación.
- Audit independiente `pnpm audit --prod --audit-level high` **sin waivers, ignores, downgrade ni continue-on-error**. El pipeline global de GitHub mantiene aparte su propio smoke Mongo8.

## Límites y release

El test de integración Web confirma el puente entre formatos, pero **no** sustituye E2E navegador con dos usuarios/dispositivos, descarga autenticada real, restore off-host, política de retención, pruebas de revocación, ni aceptación de #353. El default `STUDY_PROGRESS_ENABLED=false` y su bloqueo en producción se conservan. Las vulnerabilidades HIGH upstream de `node-forge` y `braces` mantienen el release HOLD hasta remediación verificable; nunca bajar el umbral para declarar verde.

Los PR #522, #526, #530 y #540 se consideran carriers históricos/alternativos. No fusionarlos adicionalmente al B192 sin revisar colisiones. Antes de un eventual merge, comparar el SHA vigente de main y reejecutar todos los gates en el árbol finalmente integrable.
