# B189 — Reconciliación segura de lectura y exportación privada de Study Progress

**Tipo:** integración de dos correcciones verificadas, sin cambio funcional de esquema.
**Base remota comprobada:** `main@339f781a724cfc2ec2e74b15f32a6666b9a18a50` (incluye #525, mejoras de autenticación Mobile).
**Issues y PR de origen:** [#353](https://github.com/Enzopinotti/losApuntes/issues/353), [B187 #522](https://github.com/Enzopinotti/losApuntes/pull/522) exact head `48645c4c5f0701aa0cdd1acaab8d94d62c97e428`, [B188 #526](https://github.com/Enzopinotti/losApuntes/pull/526) exact head `652373c8078f1ee27ac6571113d47597fb88daa0`.

## Por qué se necesita una integración propia

B187 y B188 nacieron de `main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9`. Ambos tienen cobertura focal y global aprobada; **su auditoría de dependencias productivas sigue en rojo** por issues #133/#141. Desde entonces, main avanzó con #525 en rutas Mobile sin tocar las cuatro fuentes de Study Progress.

No se fusionan ramas viejas completas ni se usan `ours`/`theirs`: se compararon los blob SHA en main contra los originales de las ramas de origen antes de copiar **cuatro archivos exactos** (dos código y dos pruebas) al head nuevo. Sus workflows/documentación históricos permanecen en las ramas originales; este bloque incorpora un gate conjunto y su propia evidencia, evitando duplicaciones de configuración.

## Inventario exacto de procedencia

| Destino en B189 | Origen |
|---|---|
| `apps/api/src/study-progress/mongo/study-progress-export.reader.ts` | B187, blob `3f8bcd672e44ca8fececc3d561230235ed3a77a9` |
| `apps/api/src/study-progress/mongo/study-progress-export.reader.spec.ts` | B187, blob `895ecd87668a281cf681215f447f09e656596dd5` |
| `apps/api/src/study-progress/study-progress.service.ts` | B188, blob `55203ccc6ede9fb91607001c2c710d60348b9237` |
| `apps/api/src/study-progress/study-progress.service.spec.ts` | B188, blob `015f926f74ebab560e00179493d5ef36b42b6745` |

La procedencia representa igualdad byte a byte de los archivos fuente. El estado de main permanece intacto por esta rama. No hubo copia de archivos de Mobile, sesiones, cuentas, S3, dependencias ni lockfiles.

## Invariantes combinadas

1. **Exportación v3**: lectura `study.progress` por `ownerUserId`, cursor owner-bound y canónico, página estrictamente ordenada sin duplicados/solapamientos, tamaño hasta `limit+1`; rechazar fechas `updatedAt < createdAt`. No filtrar silenciosamente registros corruptos.
2. **GET privado**: validar contra el parser Study Session v1 del servidor `plan`, `subjectId`, revisión y fechas; devolver solamente proyección canónica, nunca el objeto Mongo. Corrupción guardada => error genérico `STUDY_PROGRESS_STORED_INVALID` sin datos privados filtrados. Ausencia => 404; falla Mongo => se propaga.
3. **Mutaciones**: `save/remove` mantienen CAS por revisión, index `{ownerUserId:1,subjectId:1}` y fence de User/account closure, cuota de 16 materias.
4. **Account Export**: v1/v2 históricos conservan sus 30/31 secciones; v3 tiene 32. No añadir permisos nuevos ni reabrir archivos expirados.
5. **Producción**: `STUDY_PROGRESS_ENABLED=false` y `validateRuntimeEnvironment` siguen prohibiendo su activación hasta aceptación completa.

## Aceptación que ejecuta GitHub

El workflow `.github/workflows/b189-study-private-integrated-acceptance.yml` utiliza el SHA exacto del PR con Node24 + pnpm 9 congelado. Sus jobs independientes verifican:

- Prettier, ESLint con cero warnings y typecheck completo API;
- suites reales Jest de lectura privada, validación v1, FeatureGuard, export reader/contributor y jobs HTTP/Mongo legacy;
- contratos de integración estáticos B61/B62 para evitar regresión de versiones;
- **MongoDB 7 real `rs0`** en contenedor temporal mapeado únicamente a `127.0.0.1`, guardado privado, cambio CAS, cierre de cuenta, export v3 y reconciliación de errores a través de al menos 56 casos reales, cero omitidos;
- árbol fuente sin mutaciones y SHA idéntico antes/después de ejecutar.

Los comandos de Mongo requieren conectividad local que el test valida por sí mismo y usan una base temporal aleatoria con limpieza segura del fixture. El job Docker se destruye incluso con error. El B189 no toca producción ni ejecuta restauraciones destructivas.

### Reconciliación adicional de contrato B61 observada en CI

La primera corrida exact-head aprobó **ESLint/Prettier, TypeScript y las siete suites Jest seleccionadas**, pero el contrato estático B61 falló en una expectativa antigua del Web (`loadPlan(remote.plan)`). El Web actual ya estaba usando una salvaguarda más fuerte: vuelve a obtener `latest` del servidor, rechaza `latest.revision !== remote.revision` y recién luego usa `await loadPlan(latest.plan)`. El commit B189 `2a577fc` actualiza únicamente ese test de contrato para exigir las **tres** invariantes reales; no altera `StudyRunner.tsx`, no omite la prueba ni acepta sobreescrituras ciegas. La ejecución repetida del head definitivo debe confirmar esta corrección y el contrato B62.


La inspección preventiva del contrato estático B62 encontró otra aserción heredada que exigía cuatro propiedades Mongo en una sola línea pese a que `StudyProgressExportReader` ya las proyectaba explícitamente en líneas separadas. B189 agrega una expresión sobre `.select({ ... })` con espacios flexibles, **pero conserva todos los campos obligatorios** (`_id:0`, `subjectId`, `plan`, `revision`) y la validación independiente del plan. No se cambian permisos ni se omite el gate.

**No se puede afirmar PASS antes del check real del head final.** Los gates CI generales y el audit HIGH estricto son complementarios y no pueden omitirse porque pase el job focalizado.

## Release HOLD y orden posterior

- Esperar resultados para el SHA final; revisar las modificaciones transversales respecto de main actualizado.
- Los PR #522 y #526 son históricos/alternativos, no deben fusionarse encima de este carrier sin revisión para no duplicar el trabajo.
- #353 sigue OPEN: políticas de retención, backup/restore off-host, navegador multiusuario/dos dispositivos, fallos de autorización y revisión legal/operativa aún son requisitos.
- #133 y #141: no se crean excepciones, waivers, umbrales reducidos o cambios de auditoría.
- **No merge, no deploy ni activación productiva** mientras la auditoría y los gates de aceptación sigan bloqueados.
