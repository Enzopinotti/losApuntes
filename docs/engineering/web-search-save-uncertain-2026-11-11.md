# Web Search → Guardados: resultado incierto y navegación recuperable

Estado: **candidate** en `fix/web-search-save-uncertain-outcome-20261111`. No equivale a release ni a validación productiva.

## Motivación

La búsqueda permite a una persona autenticada guardar un Resource directamente desde un resultado público. El backend conserva la autoridad sobre acceso y responde al `PUT /resources/:id/save`. Si el navegador pierde la respuesta después de enviar la solicitud, el cliente no puede deducir si el guardado se confirmó. Un estado de éxito optimista o un nuevo PUT ciego pueden producir una experiencia engañosa.

Este cambio restaura los guardrails existentes de Search, Resources, UX y retries, sin modificar un requisito de producto ni agregar una autoridad nueva: `SEARCH-FR-002`, `RES-FR-009`, `RES-FR-012`, `NFR-UX-001` y `NFR-REL-001`. Carrier operativo: `BASE-006` (mejora técnica posterior al baseline, sin reabrir su cierre).

## Contrato observable

- Search conserva lectura pública; guardar exige sesión autenticada y usa el endpoint de Resources existente, con cookie y `AbortSignal` acotado al actor y al Resource.
- Sólo un ACK JSON `{ "saved": true }` confirmado para ese ticket permite anunciar `Guardado`.
- Un HTTP 4xx definitivo (excepto 408/429), como 401/403/404/410, muestra error de guardado sin asumir un éxito. No cambia permisos del cliente.
- Error de red, timeout, status 0, 408, 429, 5xx, respuesta exitosa inválida o resultado desconocido se considera **incierto**. Se bloquea otro click en el mismo componente y se muestra `Sin confirmar` con acción accesible `Revisar Guardados`.
- El enlace navega a `/resources?view=saved`, cuya vista está determinada por la URL. Recarga, atrás/adelante y enlaces directos preservan ese modo; el listado continúa autorizado por Resources.
- La vista Guardados nunca garantiza acceso al contenido: cada lectura sigue aplicando los permisos, visibilidad y moderación del backend.
- Los estados de guardado están aislados por sesión y Resource. No se registran tokens, consultas privadas ni grants en URL, storage o telemetría.

## Aceptación y regresiones

El contrato `scripts/test-web-search-contract.mjs` comprueba:

1. Clasificación de rechazos definitivos frente a outcomes inciertos.
2. Confirmación estricta del ACK y mensajes de fallo conservadores.
3. Freno de reintentos ciegos, estados accesibles, enlace a Guardados.
4. Vista Guardados controlada por URL, no por estado local que se pierde al recargar.
5. Targets táctiles de 44 px y ausencia de bearer/localStorage en Search.

Además se requieren `pnpm --filter @losapuntes/web check:types`, `pnpm --filter @losapuntes/web lint`, `pnpm --filter @losapuntes/web format:check`, `pnpm test:web-search-contract`, Quality Gate, auditoría productiva y smoke exact-head antes de promover el carrier. Tests de navegador y aceptación manual son evidencia adicional, **no ejecutada por escribir este documento**.

## Límites / rollout

No se agregan endpoints, dependencias, persistencia, migrations, grants ni cambios a API/Mobile. El error incierto se bloquea **durante la vida del componente**; si la persona reabre Search debe verificar Guardados antes de iniciar otra acción. El endpoint PUT conserva su idempotencia server-side.

El release permanece en **HOLD** mientras el audit HIGH productivo falle o falten gates de despliegue. Registrar SHA/run de candidato y SHA/run de main tras cualquier merge. Este documento no modifica la especificación funcional canónica, porque se corrige UX para el contrato ya aprobado.
