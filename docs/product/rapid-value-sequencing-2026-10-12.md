# Secuencia de valor rápido después de reconciliar fuentes — 2026-10-12

**Estado:** propuesta de producto y de ejecución; aún no cambia 00–03 ni da tareas del backlog por cerradas.  
**Base documental:** 00/Tesis/MVP/Loops/Métricas, 01/`RES-FR-006/009`, `SEARCH-FR-001/002`, `MOB-FR-005/007`, 02/invariantes, 03/exact-head y ambos Excel 04–05.  
**Código considerado:** `main@afd48cc...`.

## Avances del plan (reconciliados con GitHub)

- **P0, consolidación de fuentes:** integrada por [PR #278](https://github.com/Enzopinotti/losApuntes/pull/278). Hay mapa de discrepancias y plan de QA; no se ejecutó el gate de validación.
- **P1, guardar desde Buscar:** integrado por [PR #279](https://github.com/Enzopinotti/losApuntes/pull/279), reutilizando la API real de guardados y protección de sesión. Los tests del PR siguen sin ejecución certificada.
- **P2, materia → preguntas:** implementación propuesta en un carrier separado que reutiliza Q&A por `subjectId`; su nueva pantalla distingue lectura de permiso para publicar. Ver `docs/mobile/subject-questions-from-search.md`. Registrar el PR/SHA definitivo tras integración.

La tabla siguiente conserva la priorización *al momento de planear* y no vuelve a abrir features ya integrados. Ningún merge con `[skip ci]` se considera validado.

## Resultado buscado

Reducir el tiempo desde **“necesito un apunte para mi materia”** hasta una **acción útil persistente**. La promesa de Los Apuntes no es tener muchas pantallas: es conectar contexto académico, recurso, utilidad y personas. La consolidación permite privilegiar el cuello de botella de valor antes que seguir sumando módulos periféricos.

### Regla de selección

Una entrega rápida tiene preferencia si:

1. toca el loop `contexto → encontrar → abrir/guardar` o `crear → compartir`;
2. reutiliza autoridades y endpoints existentes;
3. tiene una hipótesis comprobable con usuarios, **sin fabricar instrumentación**;
4. necesita poco modelo nuevo, poca dependencia externa y un fallback seguro;
5. se puede probar negativamente en identidad, privacidad, red y UX;
6. no compromete la estabilización de Mobile v1.

## Cola propuesta, **no** segundo backlog

| Orden propuesto | Oportunidad | Valor esperado / hipótesis | Reutilización | Riesgo / límite | Carrier canónico sugerido |
| --- | --- | --- | --- | --- | --- |
| **P0 — paralelo, antes de release** | **Consolidación de evidencias del HEAD actual** | Saber si lo integrado sirve realmente y evitar regresiones acumuladas | `pnpm check`, tests mobile, smoke y plantillas ya presentes | No inventar green; el usuario solicitó omitir CI por ahora | `DOC-003/004`, `MOB-024/025/026/027`, `PROD-018` |
| **P1 — primera mejora de producto** | **Guardar desde resultados de Buscar sin abrir detalle** | Menos pasos para conservar un material relevante; el estudiante recibe valor en la misma búsqueda | `PUT /resources/:id/save`, `RES-FR-009` y Search Mobile | “Guardado” solo tras ACK; no asumir estado previo; no otorgar acceso; sesión/foco/errores | `RES-FR-009`, `MOB-FR-005/007`, `SEARCH-FR-001/002`; nueva external_key solo en Excel oficial |
| **P2** | Puente contextual “materia → apuntes y Q&A” con CTA de acción | Fomenta respuesta útil desde contexto, no feed adictivo | Academic Context, Search, Q&A, Home | Cuidar privacidad y evitar inventar visibilidad | `ACAD-FR-006`, `SEARCH-FR-004`, `QA-FR-001` |
| **P3** | Reanudar una búsqueda/material guardado al volver a la app | Reduce fricción en la segunda sesión | Guardados, navegación y contexto | No persistir URL firmada ni material sensible fuera del backend | `RES-FR-008/009`, `MOB-FR-002/007/008` |
| **P4 — posvalidación** | Colecciones personales de materiales | Organizar estudio más allá de asignatura | Guardados como relación personal | Requiere nuevo dominio, CRUD/ACL/retención y sync; no es quick win inicial | **Requisito nuevo** vía `CHG-001/002/003`; no implícito en RES-FR-009 |
| **Fuera de prioridad inmediata** | OCR, búsqueda semántica, tutor IA, marketplace, mensajería | Valor especulativo sin corpus/evidencia de uso del core | Necesitarían proveedores/investigación | 00 y 04/05 los sitúan como expansión, no primera ruta al valor | Backlog `FILES2`, `SEARCH2`, `AI`, `SOC2` Future |

## Primer carrier recomendado: guardar en Buscar

### Situación demostrada

La pantalla `apps/mobile/src/features/search/search-screen.tsx` muestra recursos con “Ver recurso” y atribución, pero no un control directo para guardarlos. El detalle ya tiene acciones de guardado y la API existente `ResourceConsumptionApi.save` usa la sesión autenticada. El backend ofrece `PUT /resources/:id/save` idempotente; guardar **no** concede permiso de lectura ni garantiza que el recurso siga accesible a futuro.

### Experiencia deseada

- Búsqueda y discovery contextual muestran acción **Guardar** por recurso autorizado y usuario autenticado.
- Tras respuesta exitosa real del backend, la fila muestra **Guardado**.
- Mientras se escribe se muestra estado ocupada, se bloquea doble toque y se conserva la navegación.
- Fallos offline/timeouts/401/403 no muestran éxito falso; un resultado de escritura ambiguo debe invitar a verificar desde Guardados, no reintentar automáticamente.
- Al perder foco, cerrar sesión, cambiar de persona o contexto académico, cancelar/fence resultados; datos del usuario anterior no quedan visibles.
- Para una persona sin sesión válida, el CTA lleva a autenticación o se omite; no intenta usar una credencial inexistente.
- No inferir “ya guardado” a partir de Search: Search no devuelve estado de bookmark. El label inicial debe ser simplemente **Guardar**; una respuesta idempotente `saved:true` confirma estado.
- No añadir tracking de “vistas” ni persistir URLs de archivos.
- Validación con lector de pantalla y prueba real en Android/iOS antes del release.

### Criterios de aceptación concretos

1. Usuario A autenticado obtiene un resultado visible, pulsa Guardar **una vez** y el backend recibe un solo PUT; la UI confirma el ACK y el recurso aparece en Guardados.
2. Se pulsa Guardar dos veces rápidamente: a lo sumo una solicitud mientras está pendiente.
3. Timeout tras posible commit: se informa incertidumbre y no se afirma “Guardado”; se comprueba desde Guardados antes de intentar nuevamente.
4. Usuario A sale de la pantalla/cambia cuenta mientras responde PUT: la respuesta tardía no confirma guardado para usuario B.
5. Resultado ya guardado: PUT idempotente no crea dos relaciones.
6. Una restricción/visibilidad cambiada produce error seguro, sin habilitar acceso por save.
7. Search sigue navegando al detalle; guardar no requiere abrir el archivo.
8. Test de contrato cliente+backend y QA nativo vinculados al SHA candidato, no a un verde de otra versión.

### Medición honesta

- **Hipótesis de producto:** menos acciones para el primer guardado, más estudiantes capaces de completar `Buscar → Guardar` sin abrir el detalle.
- **Baseline de medición:** medir flujo en beta con consentimiento y allowlist existente; si faltan eventos durables, anotar observación manual en piloto antes de introducir telemetría nueva.
- **No medir:** scroll, tiempo de pantalla o clics extra como proxy de valor.
- **Guardrails:** tasa de errores/timeout, guardados duplicados evitados, false successes, costo de red y percepción de facilidad.

## Condiciones para acelerar sin desorden

- PR de feature referencia IDs funcionales y `external_key` oficial (si se registra en Excel).
- Un cambio funcional no actualiza 01 ni reemplaza normas sin `CHG`.
- Un merge con `[skip ci]` es **implementación no verificada**, nunca `validated`.
- No forzar veinte commits triviales: preferir contratos, implementación, UX, tests, docs y fixes como unidades revisables.
- Primero calidad/observabilidad de la ruta al valor; después features independientes. Nuevos proveedores o infraestructura no pasan a P1 por entusiasmo.
