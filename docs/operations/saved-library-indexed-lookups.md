# Bloque 22 — Guardados: joins apoyados en índices y proyecciones acotadas

**Fecha:** 2026-10-14  
**Branch:** `perf/saved-library-indexed-lookups-20261014`  
**Estado:** código escrito; integración sin CI; rendimiento aún **NO medido**.  
**Componentes:** API Resources Mongo; búsqueda de Guardados; facetas por materia.  
**Trazabilidad:** RES-FR-009, SEARCH-FR-002/006, NFR-SEC-001, NFR-PERF-001.

## Problema y decisión

Los bloques 17–21 implementaron búsqueda global, facetas, sort por título y
límites de tiempo. Los dos pipelines restantes utilizaban `$lookup` con
`let` y `$expr` para unir cada save con su Resource y sus shares. Aunque
Mongo puede optimizar ciertos `$expr` de igualdad, el plan debe seguir siendo
auditable y aprovechar las claves existentes, especialmente con miles de
guardados. Además las uniones arrastraban documentos Resource enteros hasta
la fase de sort/group, aunque solo requerían unas pocas propiedades.

Este bloque usa la sintaxis `localField/foreignField + pipeline` de MongoDB
5.0+, compatible con el **MongoDB 8.0** declarado en `compose.local.yml`.

Una sola función, `authorizedSavedJoinStages`, es compartida por los dos
pipelines. La igualdad y los campos que la soportan quedan declarados de
forma explícita:

| Etapa | Clave de igualdad | Índice del esquema disponible |
| --- | --- | --- |
| Saves del actor | `userId` + orden de guardado | `{userId:1, createdAt:-1, resourceId:1}` |
| Relación Save → Resource | `resourceId = resources.id` | `resources.id`, único |
| Relación Save → Share | `resourceId = resource_shares.resourceId`; match `userId` | `{resourceId:1, userId:1}`, único |
| Guardado único | `userId + resourceId` | `{userId:1, resourceId:1}`, único |

**No se agregan índices nuevos**, ni se modifican schemas, migrations,
`ResourceService` o Account Export. Esto evita escrituras de índices
innecesarias durante el desarrollo paralelo; los índices definidos en el
schema pueden no coincidir con los construidos en una base ya desplegada,
por lo que hay que inspeccionar `getIndexes()` en el entorno real.

## Semántica de autorización intacta

La ejecución continúa empezando **por los saves del usuario autenticado**.
El `$lookup` de Resource filtra por `moderationState='available'`, aplica
`q` y `subjectId` cuando corresponde, y **después** proyecta solo:

- Para búsqueda: `visibility`, `authorUserId`, `subjectId`, `title`.
- Para facetas: `visibility`, `authorUserId`, `subjectId` (sin título).

El `$lookup` de shares limita por el `userId` del principal autenticado,
retiene máximo un match y proyecta solo su `_id`; jamás devuelve el listado
de destinatarios compartidos. El `$match` exterior deja pasar únicamente
Resource público, de autoría del actor o `shared` con share vigente.

Ambas consultas siguen haciendo el filtro ACL **antes del `$limit` final
o `$group` por Subject**. El servicio hace luego una segunda
reautorización de cada Resource con `ResourceService.get`.

No se cambian los cursores v1/v2, el orden por fecha/título, los límites de
página, `maxTimeMS`, `allowDiskUse`, el endpoint original, ni la respuesta
de la API. No hay caché de permisos o de contenidos.

## Plan de verificación conjunta

Estas comprobaciones son **pendientes**; ningún valor de latencia es supuesto.

1. **Presencia real de índices** en staging con `getIndexes()` para
   `resource_saves`, `resources` y `resource_shares`. Confirmar que
   el índice de saves y el índice único de shares realmente existen.
2. **Planes `explain('executionStats')`** antes/después en conjuntos
   representativos (100, 1.000, 10.000 guardados por actor, incluyendo
   recursos públicos, propios, compartidos, privados, ocultos y revocados).
3. Revisar `indexesUsed`, `IXSCAN`/`COLLSCAN`, `totalKeysExamined`,
   `totalDocsExamined`, `nReturned`, `executionTimeMillis` y uso de
   disco para búsqueda por fecha, título global, texto + Subject y facetas.
   Inspeccionar por separado el `$lookup` de Resource y el de Share.
4. Verificar la misma paginación y títulos, colación `es` (strength 1),
   cursor A→B, múltiples shares, revocación entre páginas y conteos de
   facetas sin filtraciones de recursos privados.
5. Medir p50/p95/p99 con concurrencia realista y confirmar que
   `maxTimeMS=8000` no cause una tasa de timeout inaceptable. Registrar
   versión de Mongo, cardinalidad, pool e índices, no credenciales ni datos
   personales.
6. Ejecutar `@losapuntes/api` tests/typecheck/lint y smoke en staging,
   más QA Mobile usando el SHA exacto de `main`, junto al gate acumulado.

Ejemplo de inspección **solo lectura** en `mongosh` usando una base de
staging autorizada, nunca credenciales de producción en terminales
compartidas:

```javascript
db.resource_saves.getIndexes();
db.resources.getIndexes();
db.resource_shares.getIndexes();
const sampleActor = '<actor-de-prueba-autorizado>';
db.resource_saves.explain('executionStats').aggregate([
  { $match: { userId: sampleActor } },
  { $project: { _id: 0, resourceId: 1, createdAt: 1 } },
  {
    $lookup: {
      from: 'resources',
      localField: 'resourceId',
      foreignField: 'id',
      pipeline: [
        { $match: { moderationState: 'available' } },
        { $project: { _id: 0, visibility: 1, authorUserId: 1, subjectId: 1, title: 1 } },
      ],
      as: '__resource',
    },
  },
  { $unwind: '$__resource' },
  {
    $lookup: {
      from: 'resource_shares',
      localField: 'resourceId',
      foreignField: 'resourceId',
      pipeline: [
        { $match: { userId: sampleActor } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ],
      as: '__viewerShares',
    },
  },
  {
    $match: {
      $or: [
        { '__resource.visibility': 'public' },
        { '__resource.authorUserId': sampleActor },
        { $and: [
          { '__resource.visibility': 'shared' },
          { '__viewerShares.0': { $exists: true } },
        ] },
      ],
    },
  },
  { $sort: { '__resource.title': 1, resourceId: 1 } },
  { $limit: 26 },
], { allowDiskUse: true, collation: { locale: 'es', strength: 1 }, maxTimeMS: 8000 });
```

Este es un **plan de inspección**, no un benchmark ejecutado. Para comparar
contra el pipeline de fecha, usar la ruta real con `$sort:
{createdAt:-1,resourceId:1}` tras `$match`, omitir la colación de título,
y mantener `$limit=limit+1` después de autorizar.

## Regresión y riesgos pendientes

Se escribieron pruebas del helper que verifican la sintaxis de los joins,
campos mínimos, condición completa de autorización y claves de índices en
los schemas, y se actualizan las regresiones Mongo anteriores. No se
ejecutaron.

**Riesgos restantes:** búsquedas de texto con regex sin prefijo útil pueden
seguir recorriendo múltiples saves; título global sigue requiriendo sort
después del join. **Atención a colación:** la consulta de título aplica
colación española con intensidad 1, mientras los índices simples de cadenas
pueden tener otra colación. Mongo podría no usar algunos índices en esa ruta:
revisar `indexesUsed` y `COLLSCAN` en el `explain` real antes de afirmar
que el cambio acelera el orden por título. No introducir automáticamente un
índice nuevo sin justificar cardinalidad, costo de escritura y colación. Proyectar documentos más chicos y usar igualdad con
índices **no garantiza** mejora de p95 sin `explain` ni carga real.
Las construcciones del helper requieren MongoDB 5.0 o superior: si cambia la
matriz de despliegue, actualizar este contrato antes de ponerlo en producción.

**Proceso:** PR con commits atómicos `[skip ci]`, merge commit sin squash,
estado **integrado / NO VALIDADO** hasta el cierre conjunto por SHA.
