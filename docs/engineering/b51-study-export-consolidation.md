# B51 — Consolidación controlada de PR #331 y #333

## Propósito

El trabajo paralelo dejó dos PR en borrador, con mejoras correctas pero
desfasados respecto del `main` actual. B51 porta **solo sus correcciones
de código y pruebas** a una rama nueva creada desde el `main` posterior a
B50. Los workflows nuevos de esos PR **no se copian**: la decisión de ejecutar
CI de todo el repositorio sigue separada del merge.

### Estudio: correcciones del PR #333

- Retira el import obsoleto de `normalizeStudyKitArchive` en `StudyKits`.
- Antes de confirmar el borrado del plan en `StudySession`, requiere
  `subjectId` derivado del contexto académico autenticado y vigente. El
  plan nunca se resetea usando un identificador nulo.
- Incorpora `scripts/test-web-study-type-guards.mjs`, sin cambiar rutas ni
  permisos de recursos ni formato de intercambio.

### Exportación: fixtures del PR #331

- Los casos de `AccountExportAssembler` generaban un registry incompleto
  aunque el contrato v1 **siempre exige 30 secciones**. Se agrega un
  relleno **únicamente dentro del fixture Jest**, sin introducir una salida
  parcial en el ensamblador ni en el runtime Nest.
- Se agrega un caso explícito que exige rechazo con una registry incompleta.
- El JSON esperado, SHA-256 y longitud UTF-8 se comprueban sobre el
  documento completo de 30 secciones, no solo sobre las dos simuladas.
- Se corrige el tipo de la versión inválida 99 en el test de descarga,
  preservando la intención de verificar rechazo antes de leer almacenamiento
  privado.

## Invariantes del contrato

La exportación de cuenta v1 conserva los 30 identificadores existentes,
ordenados y únicos. `study.collections` pertenece exclusivamente al
inventario v2 de 31 secciones. Ninguna corrección de tests incrementa
`ACCOUNT_EXPORT_FORMAT_VERSION` ni activa Colecciones persistentes.

El script `node scripts/test-b51-study-export-consolidation.mjs` comprueba
de forma independiente los invariantes de código y un sobre JSON sintético
de 30 secciones. **No es un reemplazo de Jest, TypeScript o un E2E.**

## Gates pendientes

En un checkout con dependencias y Node 24/pnpm 9.15.9, ejecutar:

```sh
node scripts/test-web-study-type-guards.mjs
node scripts/test-b51-study-export-consolidation.mjs
pnpm --filter @losapuntes/api exec jest --runInBand --runTestsByPath src/data-lifecycle/domain/account-export-assembler.spec.ts src/data-lifecycle/account-export.controller.spec.ts
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/api check:types
```

El PR #333 conserva su workflow de typecheck y #331 su CI modificado:
se debe decidir por separado si integrarlos. No fusionar esas ramas
antiguas sobre B51 sin volver a revisar el diff. B51 acredita integración
de correcciones y comprobaciones aisladas, no aprobación de producción.
