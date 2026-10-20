# B147 — Bandeja de solicitudes de conexión (Backend v1)

## Resultado funcional

Separar solicitudes pendientes entrantes y salientes en la API social de Los
Apuntes para que el usuario pueda responder sin paginar todas sus conexiones.

El flujo reutiliza `SocialService.respond` y las notificaciones transaccionales
ya existentes. No crea relaciones nuevas, permisos ni categorías de datos
personales; cuenta y lista sólo el estado social ya persistido.

## Criterios de aceptación

1. El usuario A sólo puede consultar sus propias solicitudes, determinadas
   por el `AuthSessionGuard`, nunca por un `userId` de la URL.
2. `GET /social/me/connection-requests` muestra exclusivamente solicitudes
   `pending`, filtradas como `incoming` o `outgoing` por MongoDB antes de
   aplicar el límite; el `other` se obtiene desde Profile.
3. `incoming` sólo incluye solicitudes cuyo `requestedByUserId` es distinto
   del actor pero el actor participa en la relación. `outgoing` sólo incluye
   solicitudes creadas por él.
4. La respuesta conserva `requestedByMe` e `incoming` para elegir
   las acciones de Aceptar/Rechazar existentes sin reimplementar la autoridad.
5. Cursores no reutilizables por otra cuenta ni dirección, tope 25 entradas,
   orden estable con desempate por id.
6. `GET /social/me/connection-requests/incoming-count` devuelve únicamente
   `pendingIncomingCount`; cero real es válido, error Mongo no es cero.
7. Casos de registros corruptos, participantes cruzados, estado modificado o
   dirección inconsistente fallan cerrados, sin enriquecimiento de Profile.
8. El listado anterior de `GET /social/me/connections` conserva contrato
   y paginación para clientes existentes.
9. Los índices `userLowId/userHighId+status+requestedByUserId+updatedAt+id`
   están declarados para consultas de ambas posiciones de participante.
10. Tests exact-head de controller, DTO, cursor, dominio, store Mongo, regresión
    social, ESLint estricto, TypeScript/Prettier y smoke requeridos para merge.

## Entrega a frontend

La desarrolladora del frontend puede usar el endpoint de listado para
pestañas Recibidas/Enviadas y el contador para la insignia de navegación,
sin descargar toda la red social ni mantener filtros de seguridad en React.

Ningún archivo `apps/web` ni `apps/mobile` se modifica en B147.

## Estado de integración

Requisito propuesto `SOC-FR-007` pendiente de reconciliar con el documento
funcional canónico 01. No se tocan `Account Export`, Auth, flags productivas
ni excepciones de seguridad. La auditoría #133/#141 y el release #353
permanecen en HOLD hasta evidencia de remediación completa.
