# B75 — Restaurar fixture de epoch de Account Export v3

## Hallazgo

El `main@a763ddc4bf85374d27208ce05db5e7c26bf3c118` incorpora `UsersService.getStudyProgressExportEpoch` para impedir que una exportación privada incluya datos de distintas revisiones. En `DataLifecycleModule account export wiring`, la prueba v3 construía `AccountExportService` con un doble de `UsersService` que solo definía `hasActiveAccount`; ejecutar realmente el assembler fallaba con `TypeError: this.users.getStudyProgressExportEpoch is not a function`.

## Corrección

- Se alinea el doble con la autoridad de producción: `getStudyProgressExportEpoch` devuelve un entero seguro (0) y se comprueba que se llame **dos veces** sobre el mismo owner: al iniciar la escritura y antes del commit.
- Se comprueba la ruta **fail-closed**: epoch capturado 0 y observado 1 ⇒ error de revisión, `sink.abort` llamado una vez y `sink.commit` nunca.
- El manifiesto v3 conserva exactamente **32 secciones**, con `study.progress` owner-scoped y lectura paginada; las pruebas legacy v1/v2 no cambian.
- No se modifican contratos HTTP, persistencia, estado de producción, permisos ni datos.

## Validación y relación con carriles

El workflow focalizado `Account Export V3 Epoch Fixture` ejecuta Jest real sobre el módulo, contrato de epoch B64 y TypeScript API con checkout del **SHA exacto**. El gate general no se modifica y seguirá bloqueando por deudas independientes hasta cierre y CI post-merge.

La reparación no duplica #364 (otros fixtures de export v3), #365 (orphan cleanup), #351 (CAS de colecciones) ni #349 (formato API). #349 contiene el mismo archivo de prueba; al reconciliar debe conservarse el nuevo mock y el test de epoch. No forzar actualizaciones ni declarar verde sobre otro SHA.
