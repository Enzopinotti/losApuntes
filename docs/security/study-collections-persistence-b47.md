# B47 — Colecciones persistentes: integración opt-in con exportación v2 y cierre de cuenta

**Código integrado con activación deshabilitada por defecto. No es evidencia de release.**

## Arquitectura y producto

El código del borrador original [PR #316](https://github.com/Enzopinotti/losApuntes/pull/316) se portó a una rama nueva creada desde el `main` que ya contiene B40–B46. No se arrastraron las rutas o layouts obsoletos del borrador.

El producto Web suma `/study-collections` como ruta privada. Permite alta, listado paginado, detalle, revisión de descripción, vinculación y desvinculación de hasta 100 IDs de recursos, y eliminación. La API `/study-collections` ofrece su CRUD con `AuthSessionGuard`, control de propietario y claves idempotentes. Un recurso enlazado no concede permisos: para mostrar metadatos se consulta de nuevo la autoridad Resources; los errores 403/404 se presentan como referencia inaccesible.

La experiencia **portátil temporal** de B44 `/study/kits` se mantiene como alternativa independiente; no se migra ni se borra ningún kit portable.

> **Actualización B49 (octubre de 2026):** desactivar el flag no desactiva
> la portabilidad de datos que ya existen. Una nueva exportación sigue
> siendo v2 cuando el propietario conserva colecciones privadas, incluso
> si el CRUD se deshabilitó por rollback. Los archivos y trabajos v1
> preexistentes conservan su versión original. Ver
> [política de rollback](account-export-b49-rollback-portability.md).

## Activación coordinada y segura

La nueva variable API `STUDY_COLLECTIONS_ENABLED` se valida estrictamente como booleano y es **false por defecto**. Si no es exactamente `true` en el servidor, `StudyCollectionsFeatureGuard` rechaza todo el controlador persistente. El frontend oculta el enlace a sincronización cuando `VITE_STUDY_COLLECTIONS_ENABLED` no es `"true"`. El frontend por sí solo **no autoriza** ningún endpoint.

En el mismo despliegue, el backend con `STUDY_COLLECTIONS_ENABLED=true`:
- habilita los endpoints propietarios de Colecciones;
- solicita nuevos trabajos de **Account Export versión 2**, que incorpora las 31 secciones exactas (30 previas y `study.collections`);
- conserva trabajos durables históricos v1, que siguen emitiendo v1, sin reetiquetar artefactos;
- **rechaza con 409** el intento de reutilizar un trabajo v1 todavía activo como si exportara datos de las nuevas Colecciones; el usuario debe repetir la solicitud después de que finalice.

No activar variables en pods de forma descoordinada: **todos los servidores y workers deben estar desplegados con código B45–B47**, y el backend debe cambiar a true de forma coordinada. El export worker interpreta la versión almacenada en el job.

El valor de backend continúa en false en ausencia de una configuración explícita. Este PR **no** modifica configuración de despliegue en la infraestructura operativa, variables remotas ni features de producción.

## Cierre, retención y carrera de concurrencia

El cierre conserva sus comprobaciones de contraseña y rol de administrador, y es transaccional:
1. Verifica ausencia de bloqueos de gestión de organizaciones.
2. Cierra el usuario y aumenta su versión de credenciales.
3. **Elimina `study_collections` por `ownerUserId` dentro de la misma transacción Mongo**, sin afectar recursos, perfiles de terceros ni organizaciones.
4. Marca el perfil cerrado, registra limpieza diferida de sesiones y tokens y audita el evento.

Desde B50, **todas las mutaciones privadas** de una colección (crear, editar, agregar recurso, quitar recurso y eliminar) adquieren un conflicto de escritura sobre el mismo documento User, incrementando `account_lifecycle_revision` en transacción. Así, ninguna mutación que compita con el cierre puede confirmar cambios privados después de que ese cierre se confirmó. Los errores de conflicto transaccional requieren el mecanismo normal de reintento de Mongo. La validación requiere replica set; consultar [aceptación B50](study-collections-b50-transactional-acceptance.md). Si la cuenta está cerrada, falla antes del upsert. El cierre no es un borrado global: permanecen las políticas de conservación de otros contenidos/artefactos y backups conforme a sus reglas, que requieren documentación de retención más amplia.

- **Actualización B50:** incluso las ediciones, altas/bajas de recursos y eliminación manual usan el mismo límite transaccional que el cierre. Las cinco escrituras de Colecciones están protegidas en el mismo documento de autoridad User. La ejecución con Mongo replica set sigue pendiente.

## Compatibilidad y límites

- Se reutiliza **exactamente el esquema Mongo B46**, sin crear una segunda definición de `study_collections`.
- El backend original de #316 sigue separando dueño, clave idempotente y permisos Resources.
- El frontend se integra a la Mesa B40–B44 sin sobrescribir sus rutas ni el Layout actualizado.
- La exportación v2 usa el `StudyCollectionExportReader` owner-only de B46; solo incluye IDs, título, descripción propia, revisión y timestamps, no contenido de apuntes o URLs firmadas.
- El botón de sincronización **no debe mostrarse** cuando la variable frontend está desactivada. La API responde 503 si se accede directamente con la función desactivada.

## Aceptación requerida ANTES de activar

1. Ejecutar `pnpm` / Jest/TypeScript/ESLint/Prettier y Web build contra el checkout exacto de PR B47.
2. Levantar Mongo Replica Set para pruebas de transacción real: carrera crear/cerrar en ambos órdenes, rollback ante error de borrado, idempotencia y aislamiento entre dos usuarios.
3. E2E autenticación, CRUD de Colecciones, 403/404 por recursos retirados, conflictos de revisión, paginación y múltiples dispositivos.
4. Ejecutar la matriz completa de Account Export: con flag off y sin colecciones (v1, 30 secciones); flag on (v2, 31); **flag off con colecciones privadas preexistentes (v2, 31)**; Mongo inaccesible (no crear v1); trabajo v1 activo (409); reinicio del worker. Véase [B49](account-export-b49-rollback-portability.md).
5. Verificar el cierre de cuenta que borra colecciones del propietario y no las de otra cuenta, la limpieza diferida de sesiones/tokens y los errores del worker.
6. Documentar retención/erasure/backups y evidencia de S3 antes del corte real. No inferir certificación a partir de tests fuente aislados.

**La integración del PR B47 no activa ni certifica la sincronización en producción.**
