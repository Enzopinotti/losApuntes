# B145 — Mis preguntas académicas (API-first)

**Requisito propuesto:** `QA-FR-004` — una persona autenticada puede recuperar únicamente las preguntas disponibles que escribió, sin buscar globalmente por coincidencias ni asumir que el cliente conoce su identidad interna.

## Alcance aceptable para backend v1

- `GET /questions/mine` con sesión Auth válida y sin authorId configurable.
- Filtros existentes de Q&A: texto, materia académica canónica, estado abierto/cerrado.
- Orden estable y paginación `limit <= 50` con cursor opaco vinculado a la identidad autenticada.
- Misma proyección autorizada que Q&A pública; no filtrar borradores de moderación ni contenido oculto a través del nuevo endpoint.
- Query Mongo autor + moderación antes de límite; índice compuesto para el patrón real.
- Respuesta con estados vacíos y errores declarados en el contrato HTTP.
- **No se modifica Web/Mobile**: los clientes podrán consumir el contrato sin mantener reglas de autoría y privacidad en React.

## Seguridad, aceptación y operación

1. Un usuario A no puede elegir ID de B para recibir sus preguntas.
2. Sólo se devuelven preguntas `moderationState=available`.
3. El cursor de A no funciona en B; encoding alterado o fechas/IDs inválidos fallan 422.
4. Los filtros de materia se resuelven en Academic Graph; mismo conjunto de resultados visibles y atributos que Q&A v1.
5. `limit=50` máximo y `limit+1` determinan continuación; cambios concurrentes pueden modificar el orden sin generar autoridad.
6. El índice `authorUserId,moderationState,updatedAt DESC,id ASC` soporta el acceso esperado.
7. Los tests unitarios de servicio, cursor, controlador y Mongo deben aprobar sobre SHA exacto.

## Frontera de entrega

El requisito propuesto debe reconciliarse en **01 — Especificación Funcional y Requerimientos** antes del cierre documental formal. Integración y lanzamiento siguen sujetos a Quality Gate, Production Audit y runtime smoke; los issues #133/#141 y release #353 permanecen en HOLD sin excepciones.

**Dependencias:** Q&A v1, Academic Graph, Profile, Auth. No se agregan esquemas, exportación privada, telemetría ni permisos nuevos.
