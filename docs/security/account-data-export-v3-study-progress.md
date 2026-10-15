# B62 — Account Export v3: study.progress

**Estado:** implementación de código e instrumentos de aceptación. No se habilita `STUDY_PROGRESS_ENABLED` en producción; la barrera de B61 permanece y la issue #353 no está cerrada.

## Contrato inmutable

| Versión de trabajo | Secciones | Qué contiene |
| --- | ---: | --- |
| v1 | 30 | Exportación histórica, sin Colecciones ni Study Progress |
| v2 | 31 | v1 + `study.collections` |
| v3 | 32 | v2 + `study.progress` |

El valor por defecto para una cuenta sin datos privados nuevos continúa siendo `ACCOUNT_EXPORT_FORMAT_VERSION=1`. El servicio elige **v3** si `STUDY_PROGRESS_ENABLED=true` (en un entorno local habilitado) **o** si existe algún documento de progreso del dueño, incluso después de un rollback de la funcionalidad. Si no hay progreso pero hay Colecciones, elige v2; de lo contrario v1.

Una tarea ya persistida conserva su formato. Un trabajo v1/v2 anterior **no se reutiliza** si el usuario ahora requiere v3 (409 `ACCOUNT_EXPORT_LEGACY_JOB_ACTIVE`). La nueva tarea puede solicitarse al concluir el trabajo antiguo. Errores en la búsqueda de datos privados abortan la solicitud antes de crear trabajo: nunca se emite una v1 incompleta por una caída de Mongo.

## Proyección de datos

La sección se llama `study.progress`. Cada elemento contiene solo:

- `subjectId`: UUIDv4 de materia
- `plan`: esquema portable exacto `losapuntes.study-session` v1 (título, notas, actividades con IDs, minutos y `done`)
- `revision`: versión CAS del guardado
- `createdAt`, `updatedAt`: timestamps ISO UTC

Ejemplo de **una sección**, no del archivo global entero:

```json
{
  "study.progress": [
    {
      "subjectId": "11111111-1111-4111-8111-111111111111",
      "plan": {
        "format": "losapuntes.study-session",
        "version": 1,
        "subjectId": "11111111-1111-4111-8111-111111111111",
        "title": "Repaso del parcial",
        "notes": "",
        "startsAt": null,
        "tasks": [
          {
            "kind": "question",
            "id": "22222222-2222-4222-8222-222222222222",
            "minutes": 20,
            "done": true
          }
        ]
      },
      "revision": 2,
      "createdAt": "2026-10-14T12:00:00.000Z",
      "updatedAt": "2026-10-15T12:00:00.000Z"
    }
  ]
}
```

No contiene `ownerUserId`, `_id`, credenciales, títulos de terceros, URLs de archivos, respuestas ajenas ni permisos de acceso. Los IDs referencian contenido que deberá volver a autorizarse en cualquier lectura o recuperación.

## Seguridad de paginación y errores

`StudyProgressExportReader` es un módulo exclusivamente de lectura; no habilita el controlador CRUD de B61. Usa el índice compuesto único ya existente `{ownerUserId:1,subjectId:1}`, orden `subjectId ASC` y cursor opaco v1 con `ownerUserId` y `afterSubjectId`. Se verifica codificación base64url canónica, tamaño y estructura exacta del cursor, identidad del propietario y límite de página de 1 a 100. No se amplían referencias ni se materializa contenido de terceros. La API usa páginas de 100, por lo que el límite de 16 materias de B61 cabe en una página en condiciones habituales.

La corrección transversal del B62 permite a `S3AccountExportArtifactStorage.commit` aceptar v1, v2 y v3 sin perder validación de SHA-256, longitud ni **sección esperada para esa versión**. Antes la escritura estaba restringida literalmente a v1, lo que también bloqueaba v2. El smoke de exportación usa los conteos 30/31/32 en función de la versión efectiva.

Un registro persistido con plan inválido, revisión malformada, fecha inválida o un fallo de Mongo debe **abortar todo el armado**; no se transforma en un resultado vacío. El ensamblador conserva `abort`, control del dueño activo, verificación de claim, SHA-256 y longitud de descarga de los formatos anteriores. El archivo expira conforme a la política ya existente de siete días.

## Cierre de cuenta y retención

B61 elimina `study_progress` en la misma transacción que marca la cuenta como cerrada. La lectura para exportación no elude `assertActiveAccount` del servicio de exportación. B62 agrega aceptación Mongo opt-in para comprobar que una exportación owner-only ve el progreso antes de la baja y deja de verlo después, sin alterar el registro de otra cuenta.

La persistencia de la sesión puede sobrevivir entre dispositivos hasta que el usuario borre el guardado o cierre la cuenta; **el presente bloque no define una retención temporal automatizada del plan**. Esa política y las restauraciones de backup siguen sujetas al gate operativo de #353. El artefacto global de exportación se elimina según el TTL privado existente; no es el mismo ciclo de vida que el plan guardado.

## Pruebas incorporadas y gates

- Unit Jest: lector owner-scoped, cursor, proyección, corrupción, errores de DB; contribuidor sin campos extra; registro Nest de 32 secciones, v1/v2 intactas, v3; selección de versión con rollback; enrutamiento del worker y descarga v3.
- Mongo replica set local y efímero opt-in: lectura antes/después del cierre transaccional y aislamiento entre propietarios.
- Scripts de regresión B45/B46/B49 adaptados para reconocer v3 sin eliminar sus contratos históricos; `scripts/test-account-export-b62-integration.mjs` agrega chequeos estáticos.

**Evidencia pendiente** antes de afirmar calidad productiva: TypeScript/lint/Jest reales, pruebas Mongo/S3 del worker y de integridad de bytes, exportación multiusuario y cierre concurrente, pérdida de lease, backup/restore, límites operativos y revisión exact-head de PR paralelos. No se activan flags de producción ni se omiten bloqueos #133/#141.

### Coordinación

El PR paralelo #349 toca el mismo `data-lifecycle.module.ts` y fuente de exportación; actualizar su base antes de fusionarlo. El PR #331 modifica pruebas del ensamblador v1; no revertir cambios v3 ni las 30 secciones canónicas de v1. La issue #353 permanece abierta hasta completar el resto de su checklist.
