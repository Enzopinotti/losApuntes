# B61 — Continuidad privada de sesiones de estudio

**Estado: implementado como funcionalidad opt-in; `STUDY_PROGRESS_ENABLED=false` y `VITE_STUDY_PROGRESS_ENABLED=false` por defecto. No habilitar en producción.** Esta implementación no equivale a aprobación E2E/QA.

## Valor real

Una sesión de B59/B60 deja de depender exclusivamente de la memoria de la pestaña o de trasladar un JSON. Con la función habilitada en un ambiente local seguro, desde `/study/run?subjectId=<UUID>` se puede:

1. **Consultar mi guardado:** comprobar si existe una sesión propia para la materia, con fecha y revisión.
2. **Guardar sesión en mi cuenta:** crear el primer guardado o actualizar uno conocido. La acción es manual; no hay sincronización automática ni sobrescritura de progreso desconocido.
3. **Recuperar sesión guardada:** descartar la sesión local sólo tras confirmar y revalidar en API cada pregunta/apunte.
4. **Eliminar guardado:** confirmación explícita y precondición de revisión; la copia local y los JSON exportados siguen intactos.
5. Reanudar desde otro navegador/dispositivo iniciando sesión en **la misma cuenta**, dentro de una materia actual admitida por Contextual Discovery.

## Contrato HTTP de la API

Protección común: `AuthSessionGuard`, `StudyProgressFeatureGuard`, `Cache-Control: private, no-store`, cookies de sesión ya existentes; nunca aceptar `ownerUserId` desde el cliente.

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/study-progress/:subjectId` | `{progress:{plan,revision,updatedAt}}` o 404 |
| PUT | `/study-progress/:subjectId` | `{expectedRevision,plan}`, crea con revisión 0 o actualiza con revisión exacta; 409 ante carrera |
| DELETE | `/study-progress/:subjectId` | `{expectedRevision}`, borra sólo la revisión exacta; `{deleted:true}` |

Cada cuenta admite **hasta 16 materias con progreso guardado** (cuota transaccional). Un usuario y una materia tienen **un único registro privado** mediante índice Mongo único `(ownerUserId, subjectId)`. `revision` empieza en 1. No existe endpoint de listado global, datos públicos ni reasignación de propietario.

El servidor exige esquema **Study Session v1** cerrado: `format`, `version`, `subjectId`, `title`, `notes`, `startsAt`, `tasks`. Hasta 24 actividades, 1.200 minutos, 64.000 bytes UTF-8, UUIDv4 canónicos y datos acotados. Rechaza campos adicionales como títulos de terceros, archivos, URLs de acceso, tokens y grants.

## Concurrencia y privacidad

- Las escrituras usan compare-and-swap por revisión. Ninguna pérdida de respuesta se interpreta como éxito: el usuario tiene que **consultar nuevamente**. 409 deja intacto el plan local.
- La escritura y eliminación ocurren en transacción Mongo con un **fence de la revisión de User** compartido con el cierre de cuenta.
- El cierre de cuenta elimina los documentos de progreso de esa persona en la **misma transacción** que cambia la cuenta a `closed`. Una escritura posterior no pasa el fence.
- Un plan guardado solo contiene metadatos escritos por el estudiante e IDs de referencia. Nunca otorga permiso a leer preguntas o Files: la recuperación vuelve a consultar cada recurso y la materia.
- Los resultados previos se invalidan al cambiar de usuario, sesión o materia. La Web no introduce localStorage/sessionStorage/IndexedDB ni credenciales locales.
- Las valoraciones B60 y los cronómetros B59 **no forman parte del formato v1** y no se sincronizan. Los `done` sí; son declaraciones del estudiante, no notas ni resultados certificados.
- No se borra ningún recurso académico al quitar el progreso. El exportador JSON portátil de B59/B60 sigue disponible.

## Barrera de despliegue obligatoria

`validateRuntimeEnvironment` **rechaza** `STUDY_PROGRESS_ENABLED=true` en `DEPLOYMENT_PROFILE=production`. Se permite habilitar localmente para test controlado, nunca como autorización de producción.

**B62 incorpora en código** `study.progress` a una exportación privada v3 de 32 secciones, sin cambiar v1/v2. **Antes de liberar** sigue siendo obligatorio verificar esa cobertura con Jest, Mongo/S3/HTTP reales, además de definir política de retención, backups/restore y límites operativos, probar sesiones cruzadas, cierre de cuenta y revocación de acceso, y documentar gestión legal. El bloqueo de producción sigue vigente. No agregar excepciones de auditoría de dependencias #133/#141.

## Verificación

- `apps/api/src/study-progress/domain/study-progress.plan.spec.ts`: validación de esquema, datos extraños y límites.
- `apps/api/src/study-progress/study-progress.feature.guard.spec.ts`: fail closed.
- `apps/api/src/study-progress/mongo/study-progress.mongo-int.spec.ts`: opt-in únicamente sobre Mongo local con replica set verificado; DB efímera aislada; prueba CAS, aislamiento, delete y cierre real.
- `scripts/test-study-progress-b61-integration.mjs`: contratos de integración estática.
- Configuración y pruebas de cierre históricas actualizadas para la nueva dependencia.

**Sin ejecutar CI, contenedores, Mongo ni navegador en este bloque.** Ejecutar estas pruebas en el entorno de desarrollo completo antes de cambiar los flags.

## Conciliación

Base de B61: `main@76d850e5925de5836334f9fed5fa28b3e7b5e8a9`. El PR paralelo #349 reforma archivos API que B61 toca en la ruta de cierre de cuenta, y necesita reconciliación explícita. Los PR #333/#344 afectan `StudySession.tsx`, que B61 evita editar. No pisar las mejoras B59/B60.
