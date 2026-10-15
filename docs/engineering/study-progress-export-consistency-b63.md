# B63 — Study Progress Account Export consistency and acceptance

**Tipo:** bugfix/consolidación interna sin nuevo requisito funcional. Restaura `NFR-PRIV-001`, `NFR-SEC-001`, `NFR-REL-001`, `AUTH-FR-012` (exportación de cuenta documentada en el contrato HTTP), y los guardrails `PLAT-FR-006/007`. No se promueve la funcionalidad a VALIDADO ni a producción.

## Problemas comprobados en `main@6513cdb2dfe4441ab520e9039ed7eaa50d131fc0`

1. **Carrera v1/v2 → v3 entre consulta e inserción del trabajo**. El servicio decidía versión con `hasOwnedProgress` y `hasOwnedCollections`, luego llamaba `AccountExportStore.requestActive` y sólo comparaba el resultado con la primera decisión. Si un estudiante guardaba un progreso en esa ventana, podía obtener una respuesta HTTP 202 que afirmase que el nuevo trabajo v1/v2 era compatible aunque ya existieran registros que exigían v3.
2. **Proyección v3 no declarada como JSON estructural**. El contribuidor asignaba un `StudyProgressPlan` tipado a la propiedad `plan` de `AccountExportRecord` (índice JSON recursivo). Esa relación no garantiza compatibilidad estructural bajo `strict`, y el mapeo directo dependía de que no se añadieran futuros campos de dominio.
3. **Falta de aceptación vertical**. B62 incorporó pruebas aisladas de lector, proveedor, worker y versiones, pero faltaba una prueba opt-in que ensamblase *desde documentos Mongo auténticos* un archivo v3 y verificase el digest del artefacto.

## Corrección

- `AccountExportService.request` **recalcula la versión requerida después de la escritura duradera** del job y vuelve a comprobar compatibilidad. Si la versión ya quedó por debajo de los datos privados del dueño, responde `409 ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE` en lugar de devolver un éxito engañoso. Errores en la segunda comprobación se propagan; jamás se tratan como conjunto privado vacío. Si un trabajo v3 antiguo se reitera después de apagar la función, **no** se degrada a v1.
- Los trabajos persistidos conservan su versión. Un trabajo incompatible debe terminar antes de poder solicitar el reemplazo. Esta barrera **reduce la ventana de carrera de aceptación**; no equivale a una snapshot transaccional de todas las secciones mientras un worker exporta datos cambiantes.
- El contribuidor construye el plan portable con claves explícitas (incluida cada tarea) para satisfacer el contrato recursivo JSON y no filtrar campos futuros.
- Jest: tests de carrera v1→v3, v2→v3, error de segundo probe y reutilización conservadora v3. Test de serialización de tareas con campos extra simulados.
- Test Mongo de aceptación **opt-in**: guardado por dos cuentas en replica-set local, ensamblado real de 32 secciones para una sola cuenta, digest SHA-256, longitud, `recordCount` y ausencia de referencias del otro usuario.
- Scripts B49/B62 de integración actualizados para probar la nueva barrera y la proyección cerrada.

## Evidencia y límites

- Comprobación aislada local con TypeScript `tsc --strict --noEmit`: el contrato `Record<string, JsonValue>` acepta el plan/tareas reconstruidos explícitamente. **Esto no es un typecheck de Nest ni prueba real del repositorio**.
- En este bloque no se ejecutan manualmente CI, Nest/Jest completos, Mongo ni S3. Los tests nuevos requieren checkout real y runtime local.
- La validación de seguridad pendiente y el control de producción de B61 permanecen **HOLD** en #353. Tampoco se alteran excepciones de dependencias #133/#141 ni se modifica el tiempo de vida de los planes, la política de backups o los flags desplegados.
- Dependencias paralelas: #349 cambia formato en `data-lifecycle`; #331 trabaja sobre los tests de ensamblado v1. Rebasar conservando estas pruebas y la segunda comprobación de versión.

## Checklist QA exact-head posterior

1. `pnpm install --frozen-lockfile`, `pnpm --filter @losapuntes/api check:types`, `pnpm --filter @losapuntes/api test:ci`, lint/format y builds sobre el SHA exacto.
2. Opt-in `STUDY_PROGRESS_TEST_MONGO_URI` únicamente contra replica set local efímero verificado. Aceptar aislación de cuentas, carrera 409, cierre y ensamblado v3.
3. Runtime Mongo/S3 con exportación de cuenta v1/v2/v3; comprobar byteLength, SHA-256, archivo privado, TTL y recuperación ante fallo/reintento.
4. Prueba concurrente de progreso creado durante el request y durante una exportación ya en curso; distinguir aceptación de versión vs snapshot temporal.
5. Revisar políticas de retención y backup/restore y registrar evidencia exact-head antes de considerar remover el bloqueo de activación productiva.
