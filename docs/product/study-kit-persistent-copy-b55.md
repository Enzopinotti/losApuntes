# B55 — Copiar kits portátiles a Colecciones sincronizadas

## Objetivo y alcance

El módulo de kits portátiles B44 permite organizar hasta 24 referencias en
un kit de estudio y exportarlo como JSON. Cuando la funcionalidad persistente
de B47 esté habilitada, B55 incorpora una acción **voluntaria y aditiva**
«Copiar kit a Colecciones sincronizadas» en la pantalla `/study/kits`.

La acción **no borra, reemplaza ni modifica** el kit original, su archivo JSON
ni las colecciones ya existentes. No constituye sincronización bidireccional:
si el usuario quitó una referencia del kit portátil, esa acción **no borra**
el apunte previamente agregado a la colección sincronizada.

## Seguridad y protección de datos

- La entrada está oculta salvo que `VITE_STUDY_COLLECTIONS_ENABLED="true"`.
  Se comprueba además que exista una sesión autenticada y una materia actual
  resuelta mediante el contexto académico del servidor.
- **El backend conserva toda la autoridad:** `AuthSessionGuard` y
  `StudyCollectionsFeatureGuard` protegen las escrituras, y cada
  `PUT /study-collections/:id/resources/:resourceId` revalida el acceso al
  recurso y la cuenta activa. El botón no concede permisos nuevos.
- Antes del PUT se vuelve a consultar cada recurso con el usuario actual:
  solo se copian los ID cuyo contenido sea accesible **y cuyo subject.id sea
  la materia vigente**. Referencias revocadas (403/404) o de otra materia
  se omiten, sin enviar sus metadatos privados al backend.
- Errores diferentes de 403/404, como 401 o una caída de red, **interrumpen**
  la operación y exponen el estado parcial. Un 403 en el PUT de la colección
  **no se ignora**: puede significar que se perdió autorización para escribir.
- No se transmite el JSON íntegro: la creación envía título, notas y la
  `operationKey`; después, las escrituras transmiten únicamente IDs.
- Máximo 24 referencias por operación, con escrituras secuenciales. La API
  sigue imponiendo su propio máximo de 100 referencias por colección.

## Idempotencia y recuperación

El UUID v4 estable del **kit portátil** funciona como `operationKey`
propietaria al crear la colección. El servidor tiene índice único por
`ownerUserId,operationKey`: si la conexión se pierde después de crear
la colección, el reintento —incluso tras recargar la pestaña— obtiene la
**misma colección**, siempre que el título y las notas no hayan cambiado.

Los PUT de recursos ya vinculados son idempotentes. Tras una interrupción
se permite reintentar el kit completo; los recursos existentes no se
duplican. La UI muestra el progreso, omisiones, errores y enlace directo
a la colección guardada cuando conoce su ID.

Si cambió el nombre o las notas desde la primera copia, la API devuelve
`STUDY_COLLECTION_OPERATION_KEY_CONFLICT`; **no** debe reutilizarse esa
clave para crear silenciosamente otra colección. La interfaz indica que
se edite la colección sincronizada existente o que se cree un nuevo kit.

El resultado `linked` cuenta referencias verificadas y procesadas,
incluidas las que ya estaban vinculadas por un reintento. No equivale
necesariamente a «nuevos apuntes añadidos».

## Regresiones y aceptación

Tests puros ejecutables en un checkout:

```bash
node scripts/test-study-kit-sync-b55.mjs
node scripts/test-study-kit-sync-b55-integration.mjs
node scripts/test-web-study-kits-integration.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web build
```

Escenarios cubiertos en el modelo: copiar recursos válidos; omitir
403 y materia ajena; abortar si se pierde el control de autoridad;
interrumpir después de una escritura, reintentar y no duplicar; rechazar
respuestas/IDs inválidos; kit vacío; no alterar el borrador portable.

**E2E pendiente** para autorización real, sincronización habilitada,
reintentos con red cortada, cambio de cuenta/materia, teclado/móvil y
persistencia después de recarga. Ejecutar en un entorno protegido
únicamente tras completar los gates B50–B54 de Mongo real y exportación
v1/v2; por defecto los flags permanecen deshabilitados.

## Compatibilidad

Sin migraciones de Mongo, nuevos endpoints, tablas, cambios en Account
Export v1/v2, automatización de CI o activación remota. El PR B55
implementa el puente de producto entre B44 y B47, no un lanzamiento
habilitado de forma automática.
