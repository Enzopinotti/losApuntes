# B153 — Reordenar recursos dentro de una colección (HTTP v1)

**Alcance:** exclusivamente API NestJS; no se modifica `apps/web` ni `apps/mobile`. La interfaz podrá incorporar arrastrar/soltar sin alterar las reglas del backend.

## Problema y solución

Las colecciones guardan sus apuntes en un arreglo `resourceIds` y ya los devuelven en ese orden desde `GET /study-collections/:id/resources`. Antes de B153 no había un endpoint para persistir el orden elegido por un estudiante.

B153 incorpora una **única mutación atómica** que reordena las referencias preexistentes; no agrega, elimina ni autoriza recursos. No permite modificar otra colección ni confiar en una lista parcial como una orden de sobrescritura.

## Endpoint

`PATCH /study-collections/:id/resources/order`

Requisitos: `AuthSessionGuard`, `StudyCollectionsFeatureGuard` sin cambio de configuración; `:id` UUIDv4. `Cache-Control: private, no-store`.

Body:

```json
{
  "expectedRevision": 4,
  "resourceIds": [
    "33333333-3333-4333-8333-333333333333",
    "22222222-2222-4222-8222-222222222222"
  ]
}
```

Respuesta cuando cambia el orden:

```json
{
  "changed": true,
  "collection": {
    "id": "11111111-1111-4111-8111-111111111111",
    "revision": 5,
    "resourceCount": 2,
    "resourceIds": [
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222"
    ],
    "updatedAt": "2026-10-20T12:00:00.000Z"
  }
}
```

Si el orden recibido coincide exactamente con el guardado y la revisión esperada es vigente, `changed=false` y **no** se incrementan `revision` ni `updatedAt`. La operación acepta `resourceIds=[]` únicamente cuando la colección ya está vacía.

## Garantías de integridad

- La identidad de propietario siempre proviene de `request.user.id`, nunca del body.
- Se exige **permutación completa**: todos los recursos actuales deben aparecer exactamente una vez, sin IDs ajenos, agregados ni omitidos.
- Máximo 100 identificadores UUIDv4 distintos, de acuerdo con `STUDY_COLLECTION_MAX_ITEMS`.
- `expectedRevision` entero seguro positivo: el backend lee la colección por `id + ownerUserId` y exige coincidencia.
- La escritura hace `findOneAndUpdate` con filtro conjunto `id + ownerUserId + expectedRevision + resourceIds originales`; la actualización solo usa `$set.resourceIds` y `$inc.revision`.
- Se utiliza **el mismo `withActiveOwnerTransaction` del adaptador de colecciones**: la actualización disputa la revisión de ciclo de vida del usuario con el cierre de cuenta. Un usuario inactivo no puede confirmar la escritura.
- Se valida la fila devuelta antes de publicar éxito; la transacción se aborta si la proyección posterior es inconsistente.
- No se leen datos de Resource en esta operación; solo se reorganizan vínculos que ya existían en una colección privada. Una referencia que luego deja de ser accesible no se convierte en una autorización ni se devuelve su contenido.
- La paginación existente de recursos incluye `revision` en su cursor. Un reordenamiento exitoso invalida los cursores de revisiones anteriores, por diseño.

## Errores y recuperación

- No autenticado: 401 estándar; feature flag apagado: 503 `STUDY_COLLECTIONS_NOT_ENABLED`.
- Colección inexistente o de otro propietario: 404 `STUDY_COLLECTION_NOT_FOUND`.
- Identificadores duplicados, inválidos, más de 100 o revisión con forma inválida: 422 `STUDY_COLLECTION_ORDER_INVALID`.
- Revisión obsoleta, conjunto distinto de recursos o CAS fallido por otra escritura: 409 `STUDY_COLLECTION_ORDER_CONFLICT`. Refrescar `GET /study-collections/:id/resources` y reintentar sobre la nueva revisión.
- Registro almacenado o resultado actualizado incoherente: 503 `STUDY_COLLECTION_ORDER_DATA_INVALID`.
- Cuenta cerrada detectada al escribir: 403 `STUDY_COLLECTION_ACCOUNT_INACTIVE`.
- Errores reales de transacción/Mongo se propagan, **no** se convierten en un éxito, falso 404 ni lista vacía.

Un cliente no debe repetir a ciegas la solicitud tras un timeout: debe refrescar la revisión para saber si la operación se confirmó. Un request idéntico con revisión anterior da 409 después de una escritura exitosa; el reordenamiento idéntico con revisión vigente da `changed=false`.

## Aceptación, pruebas e integración

Tests de servicio: ownership, 404, permutaciones, duplicados, 100 elementos, no-op, falta de permisos, revisión vencida, conflicto CAS, datos corruptos, fallo de storage. Tests Mongo: transacción de ciclo de vida activa, cierre de cuenta, selector exacto y error sin efectos falsos. Tests HTTP: guard, feature flag, ruta, validaciones de body, UUIDv4 y cabecera no-store.

No se cambian contratos de create/update/delete/add/remove. El frontend puede usar esta ruta al confirmar un drag-and-drop y actualizar localmente `revision` con la respuesta.

**Release HOLD:** issues #133/#141, Quality Gate y release #353. No se añaden waivers, overrides de dependencias ni deploy. B153 modifica el módulo `study-collections.module.ts` que también edita B151; al integrarlos se deben conservar ambos controladores y proveedores, sin forzar un merge que pierda alguno.
