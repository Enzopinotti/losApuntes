# B48 — Consistencia de Colecciones sincronizadas y validación incremental

**Estado de entrega:** correcciones implementadas sobre `main` B47, en rama aislada. La sincronización sigue desactivada por defecto en API y en navegación Web. **Este documento no reemplaza Jest, typecheck, build, Mongo Replica Set ni pruebas de navegador.**

## Defectos detectados y corregidos

### 1. Operación vieja que libera el bloqueo nuevo

Antes, la página usaba `useRef(false)` y liberaba el booleano en el `finally` de **cualquier** operación. Si el usuario cambiaba de colección/cuenta antes de resolver la primera petición, el viejo `finally` podía desbloquear la operación actual. B48 usa un *lease* de acción con identidad por objeto `{scope,ticket}`. El `finally` únicamente libera si el lease que termina es exactamente el vigente. Las operaciones de otra cuenta/sesión/colección quedan separadas por `useAsyncAuthorityFence`.

### 2. Revisión inconsistente entre encabezado y recursos

`GET /study-collections/:id` y `GET /study-collections/:id/resources` son peticiones independientes. Antes podían combinarse títulos/revisiones de un estado con referencias de otro. B48 valida **igualdad de revisiones** antes de publicar una página. En paginación exige además que la página previa tenga la misma revisión. Si se detecta un cambio concurrente, limpia los elementos anteriores, informa conflicto y permite `Actualizar colección`. No presenta como definitivos datos mezclados.

### 3. Clave idempotente obsoleta del formulario

Antes el formulario conservaba la misma `operationKey` aunque el usuario editara su título/descripción o cambiara de cuenta. B48 liga la clave a `authScope` y al contenido exacto (fingerprint JSON) de la operación: un reintento idéntico reutiliza clave, pero un cambio de contenido, cuenta o sesión solicita nueva UUID. Los campos de creación se deshabilitan durante el envío para evitar borrar ediciones posteriores sobre una respuesta pendiente.

### 4. Presupuestos y cursores también en dominio

Aunque el controlador HTTP validaba parámetros, el método de dominio `listResources` no imponía por sí mismo el límite de 1–25. Se agregó validación antes de consultar Mongo o Resources; el parser también rechaza codificaciones base64url no canónicas o decodificaciones mayores de 256 bytes. El cursor sigue ligado a dueño, colección y revisión.

### 5. Ruta Web con funcionalidad desactivada

Cuando `VITE_STUDY_COLLECTIONS_ENABLED` no es `"true"`, la pantalla de sincronización ofrece una alternativa a la Mesa sin disparar consultas de colecciones ni permitir acciones. Es una mejora de UX; la autoridad permanece exclusivamente en `StudyCollectionsFeatureGuard` del backend, que responde 503 si su flag está apagado.

## Pruebas ejecutables y controles

- `node scripts/test-study-collections-b48-authority.mjs` comprueba reintentos, rotaciones de clave, consistencia de revisiones y bloqueo de operaciones tardías, utilizando el **modelo puro real**.
- `node scripts/test-study-collections-b48-integration.mjs` comprueba la conexión a APIs, flags, cierre y exportaciones en el código fuente actual.
- `pnpm --filter @losapuntes/api test -- --runInBand study-collection.service.spec.ts` o el comando equivalente de este workspace para las pruebas de cursores y límites.
- `pnpm --filter @losapuntes/api check:types`, `pnpm --filter @losapuntes/web check:types`, format-check, lint, build y smoke real deben ejecutarse desde un checkout completo en **el SHA exacto**, no se afirman como aprobados aquí.
- E2E pendientes: dos cuentas, dos sesiones, edición concurrente de colección, carga paginada de 100 apuntes, cancelación en vuelo, rollback crear/cerrar, export v1/v2 y worker S3. Revisar estados de UI (error, vacío, no disponible), teclado y móvil.

## Despliegue

Sin modificación de flags remotas: `STUDY_COLLECTIONS_ENABLED=false` por defecto y enlaces Web ocultos sin `VITE_STUDY_COLLECTIONS_ENABLED="true"`. **No activar producción solo por fusionar este bloque.**

El PR #316 original sigue siendo un borrador obsoleto; no fusionarlo directamente con este estado de `main`. Los PR #317, #318 y #329 avanzan en carriles distintos y no deben sobrescribirse.
