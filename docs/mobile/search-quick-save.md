# Guardar desde Buscar — primer quick win del loop de valor

**Estado de este documento:** implementación integrada por PR, sin certificar pruebas nativas.  
**Requisitos base:** 00/valor antes del efecto red y Time to Value; 01/`RES-FR-009`, `SEARCH-FR-001/002`, `MOB-FR-005/007`, `NFR-SEC-001`; 02/backend como autoridad; 03/exact-head.  
**Rationale:** [secuencia de valor rápido](../product/rapid-value-sequencing-2026-10-12.md).

## Antes y después

**Antes:** en Mobile la búsqueda global y el descubrimiento contextual mostraban «Ver recurso» y atribuían el autor. Para guardarlo había que abrir el detalle y ejecutar Guardar allí.

**Ahora:** cada fila de un recurso disponible, tanto de resultados globales como de materias actuales, incorpora un CTA **Guardar**. El usuario autenticado no necesita abrir el detalle para conservar el material.

Se reutiliza `MobileResourceConsumptionApi.save` y el endpoint server-authoritative `PUT /resources/:id/save`. No se añade permiso nuevo, no se confunde el guardado con autorización de contenido, no se duplica el modelo de guardados.

## Semántica UX y seguridad

- **Estado inicial:** «Guardar», porque el contrato `SearchResponse` no garantiza un booleano de guardado previo. No se infiere «No guardado» ni se falsea estado.
- **Durante PUT:** «Guardando…», botón deshabilitado y protección adicional del controlador contra doble toque.
- **Respuesta `saved:true`:** «Guardado» y texto de confirmación. La operación es idempotente en el servidor; repetir con un recurso ya guardado no crea otra relación.
- **Fallos con resultado incierto** (timeout, offline, servidor/no ACK, error inesperado): no mostrar Guardado ni reintentar automáticamente; bloquear otro PUT ciego dentro de ese scope, ofrecer **Revisar Guardados** para comprobar el estado real.
- **Fallos definitivos** (401/403/validación/conflicto/gone/404): informar error, permitir reintentar manualmente cuando la sesión/acceso se haya corregido. Nunca permitir que el bookmark cree acceso.
- **Fencing:** cada operación pertenece a autoridad sesión+contexto y recurso. Cambiar de sesión/contexto, perder foco o salir de la app cancela pending y descarta respuestas tardías. No persistir estados de una cuenta en otra.
- **Navegación:** «Ver recurso» continúa disponible y separado del CTA Guardar. Si la cuenta quedó sin acceso, el backend sigue fallando cerrado al abrir el recurso.
- **Alcance:** no se implementa «Desguardar» directamente en Search; eso ya está disponible en detalle/Guardados y evitaría afirmar un estado previo que Search no retorna.

## Criterios de aceptación manual y regresión

1. Desde Buscar por texto, guardar un apunte visible: tras éxito aparece «Guardado» y figura en Guardados.
2. Desde recursos de las materias actuales, repetir el flujo y confirmar el mismo resultado.
3. Pulsar dos veces Guardar con red lenta: solo un PUT pendiente.
4. Guardar un recurso previamente guardado: idempotencia y confirmación válida, sin entradas duplicadas.
5. Desconectar red durante un PUT: se informa resultado incierto y se ofrece Revisar Guardados; **no** se emite un segundo PUT automáticamente.
6. Cambiar de cuenta mientras una operación responde: nunca mostrar confirmación de A a B.
7. Poner la app en background durante PUT: el resultado tardío no actualiza UI.
8. Guardar un recurso cuya visibilidad o moderación acaba de cambiar: error seguro sin bypass.
9. El CTA Guardar no navega; «Ver recurso» sigue abriendo detalle.
10. VoiceOver/TalkBack anuncia Guardar, Guardado, Guardando y recuperación con controles táctiles mínimos de 44 puntos.
11. No filtrar bearer, URLs firmadas ni identidades internas a logs ni mensajes de estado.
12. Validar API/contratos y suite Mobile en SHA exacto, además de Android/iOS instalables antes de llamarlo producto validado.

## Calidad y alcance explícitos

Los archivos de tests cubren ACK, toques duplicados, timeout, ausencia de ACK, fallos definitivos, cambio de cuenta, unmount e independencia entre recursos, más inspección de integración en Search. Por decisión temporal del usuario, `[skip ci]` significa **tests escritos pero no ejecutados**, sin afirmar typecheck, lint, formato, builds ni QA dispositivo.

Esta función evita nuevo backend/storage/eventos de telemetría: la hipótesis comercial/de producto es reducir el número de acciones necesarias para completar el primer guardado, **no** maximizar scroll ni tiempo de pantalla. La medición en piloto sigue pendiente y debe respetar telemetría allowlisted y privacidad.
