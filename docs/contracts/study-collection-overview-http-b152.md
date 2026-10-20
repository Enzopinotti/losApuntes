# B152 — Resumen personal de colecciones de estudio (HTTP v1)

**Ámbito:** NestJS API, nuevo módulo `apps/api/src/study-collection-overview` y contrato de integración. No se modifica Web ni Mobile.

## Objetivo

Mostrar una vista general de las colecciones propias, útil para una pantalla de estudio: número total, cuántas contienen apuntes, cuántas llegaron al límite de 100 recursos, cantidad acumulada de referencias y las últimas cinco colecciones modificadas. Sin descargar ni paginar todas las colecciones.

## Endpoint

`GET /study-collections/overview/me`

Requiere la sesión existente `AuthSessionGuard` **y** `StudyCollectionsFeatureGuard`. Solo funciona cuando `STUDY_COLLECTIONS_ENABLED=true`; la política fail-closed sigue intacta. El propietario se obtiene de `request.user.id`, sin parámetros de identidad, filtros por otro usuario ni acceso anónimo.

Respuesta HTTP: `Cache-Control: private, no-store`.

Ejemplo:

```json
{
  "collectionsCount": 3,
  "collectionsWithResources": 2,
  "fullCollectionsCount": 1,
  "storedResourceReferences": 103,
  "recentCollections": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "title": "Exámenes",
      "resourceCount": 3,
      "revision": 3,
      "updatedAt": "2026-10-20T15:00:00.000Z"
    }
  ]
}
```

Si el usuario no tiene colecciones, todos los contadores son cero y `recentCollections=[]`. El listado reciente devuelve como máximo **5** colecciones, ordenadas por `updatedAt DESC,id ASC`.

## Semántica precisa

- `collectionsCount`: documentos de colección almacenados que pertenecen a la cuenta autenticada.
- `collectionsWithResources`: colecciones que contienen al menos una referencia guardada.
- `fullCollectionsCount`: colecciones que alcanzaron **exactamente** el máximo de 100 referencias definido en `STUDY_COLLECTION_MAX_ITEMS`.
- `storedResourceReferences`: suma de las longitudes de `resourceIds` de todas sus colecciones. **No equivale al número de recursos únicos**, porque un mismo apunte puede guardarse en varias colecciones. Tampoco garantiza que cada recurso siga existiendo o sea accesible.
- `recentCollections`: proyección privada limitada a `id,title,resourceCount,revision,updatedAt`; sin IDs internos de dueño, referencias individuales, descripciones o contenido de apuntes.

No se realizan lecturas de Resource, descargas ni operaciones de escritura. Esta vista estadística **no concede acceso** al contenido de recursos y no sustituye los controles de autorización de sus endpoints.

## Diseño de consulta y eficiencia

Una única agregación Mongo con:
1. `$match` por `ownerUserId` autenticado.
2. `$sort` por actualización descendente y UUID ascendente, respaldado por nuevo índice `{ownerUserId:1,updatedAt:-1,id:1}`.
3. `$project` mínimo, cálculo de conteo por colección y detección de arreglos `resourceIds` inválidos o duplicados.
4. `$facet`: rama `totals` para agregados de toda la cuenta y rama `recent` con límite estricto de 5.

La rama `totals` recorre las colecciones de ese propietario; **no** se afirma complejidad constante ni métricas en tiempo real sin costo. El mismo resultado de agregación se usa para totales y recientes, evitando combinar consultas independientes. Cambios simultáneos pueden provocar resultados diferentes entre dos solicitudes; no se promete snapshot entre solicitudes.

## Validación y errores

- Sin sesión: comportamiento estándar de Auth; flag deshabilitado: 503 `STUDY_COLLECTIONS_NOT_ENABLED`.
- Principal inválido en el servicio: 422 `STUDY_COLLECTION_OVERVIEW_OWNER_REQUIRED`.
- Facets corruptos, métricas negativas/no enteras, más de 100 referencias en una colección, referencias duplicadas, estadísticas inconsistentes, propietarios cruzados o metadatos inválidos: 503 `STUDY_COLLECTION_OVERVIEW_DATA_INVALID`.
- Fallo real de Mongo: se propaga, **nunca** se muestra una cuenta vacía como sustituto.
- El resultado no expone `ownerUserId`, `resourceIds`, `operationKey`, usuarios ajenos, correos ni archivos.

## Entrega al frontend

La desarrolladora puede utilizar esta ruta para tarjetas de resumen de estudio y una lista de acceso rápido a las cinco colecciones más recientes. Las mutaciones y la paginación completa continúan en el controlador original de Study Collections. No se ha modificado ninguna pantalla ni comportamiento de frontend.

## Aceptación / release

Pruebas del filtro owner-first, pipeline indexado, estructura `$facet`, métricas, proyección segura, usuario sin datos, corrupciones, errores Mongo, guardas y ruta no-cache. CI exact-head con Jest, TypeScript, Prettier, ESLint estricto, diez coberturas críticas, Quality Gate y auditoría de dependencias productivas.

**HOLD de despliegue y merge:** issues #133/#141 y release #353. No se silencian vulnerabilidades ni se cambia el feature flag. Este PR depende de reconciliar su único cambio a `apps/api/src/app.module.ts` cuando se integre B150; no modifica el frontend ni las ramas B143–B151.
