# B60 — Repaso posterior a sesiones de estudio

**Estado:** bloque funcional integrado en una rama de desarrollo; requiere aceptación con servicios reales. No habilita nuevos endpoints, trabajos, telemetría ni persistencia automática.

## Resultado de producto

Después de utilizar «Realizar mi sesión» de B59, el estudiante puede realizar un cierre reflexivo y preparar su próximo bloque de estudio sin seleccionar todo nuevamente.

1. Cada apunte o pregunta con acceso confirmado admite una **valoración explícita**: «Necesito repasar», «Quiero reforzar» o «Lo tengo claro». Se puede borrar la valoración.
2. La valoración es distinta de la casilla **Realizada** y del temporizador. Una tarea realizada puede volver a la cola de repaso; una pendiente sin valoración también se sugiere.
3. Se puede filtrar la cola entre **todo**, **prioridad** (repasar expresamente + actividades pendientes sin valorar) y **solo refuerzo**.
4. El orden es determinista: `repeat`, `pending`, `reinforce`; dentro de cada grupo se conserva el orden del plan original.
5. Se muestra una vista previa del nuevo plan antes de generar el archivo; cada elemento explicita por qué entró y los minutos previstos.
6. Antes de exportar o transferir se vuelven a consultar `GET /resources/:id` / `GET /questions/:id`, comprobando la materia actual de la cuenta. Si se revocó el acceso a algunos, se informa la cantidad y el usuario debe confirmar su omisión. Si ninguno es accesible no se genera archivo.
7. El resultado es **Study Session JSON v1** (sin notas de valoración, contenido de terceros, títulos, grants ni URLs), con todas las casillas `done: false`, duración preservada y horario por definir.
8. Alternativamente se puede enviar al Planificador mediante **handoff privado de un solo uso**, ya existente (B58). El Planificador vuelve a verificar referencias y deja escoger agregar/reemplazar.

## Semántica exacta de las recomendaciones

- `repeat`: el estudiante marcó necesidad de repaso; aparece siempre en prioridad.
- `reinforce`: desea reforzar; aparece en todo y solo refuerzo.
- `confident`: valoración positiva explícita; se excluye, aunque la tarea aún figure pendiente.
- Sin valoración + pendiente: sugerencia por trabajo sin concluir.
- Sin valoración + realizada: no se agrega automáticamente; se puede valorar para incluir.
- Los datos del temporizador, el estado `done` y la aceptación de una respuesta Q&A **no generan inferencias de dominio ni memoria a largo plazo**.

No implementa algoritmos de repetición espaciada ni fechas óptimas. Es un plan de seguimiento basado en elecciones propias, no una evaluación educativa automática.

## Privacidad, concurrencia y límites

- Las valoraciones viven solo en memoria React, dentro del scope `status:user:session:subject`; no se exportan ni guardan en Mongo, storage local o API.
- Importar otra sesión reinicia las valoraciones; revalidar accesos conserva valoraciones únicamente de actividades que siguen disponibles.
- Autoridad de materia: `GET /discovery/contextual` + rutas privadas, como el Planificador y B59.
- Hasta 24 actividades y 1.200 minutos por el esquema Study Session v1.
- Se utilizan `AbortSignal` y `useAsyncAuthorityFence` para no aplicar respuestas de identidad/materia anterior.
- Los errores de servidor/red no se reinterpretan como revocación; un 403/404 sí produce referencia no disponible.
- La consulta de autorización y el uso del resultado no forman una transacción distribuida; el consumidor del JSON debe revalidar el recurso al abrirlo. El Planificador hace una revalidación propia.

## Archivos / regresiones

- `apps/web/src/features/study/study-review-queue.mjs` + `.d.mts`: selección pura, prioridades, validación de marcas, composición v1.
- `apps/web/src/pages/StudyRunner.tsx` y `.scss`: valoración, vista previa, filtro, revalidación y entrega.
- `scripts/test-web-study-review-queue.mjs`: 21 escenarios de modelo, autoridad, exportación y contratos de UI.

QA pendiente: ejecutar el script con Node, TypeScript/Prettier del frontend y una matriz de navegador en dos cuentas, revocaciones durante exportación, cambios rápidos de materia, recarga, ancho móvil y reconciliación en el Planificador. No se declara aptitud productiva hasta aprobar los gates reales.

## Coordinación de PR paralelos

La rama se basa en B59 fusionado en `main@4b006a672e29f7c2754c18079fe4f4209aa2b549`. Cambia el Runner de B59, incorpora módulo y tests nuevos, y ajusta **solo textos de transferencia** en `StudySession.tsx` para admitir apuntes y preguntas. Los PR draft #344 (formato) y #333 (tipado histórico) deberán reconciliar explícitamente esos textos. No modifica Colecciones, Auth, API, auditoría, lockfile ni variables de despliegue. Los bloqueos de dependencias #133 y #141 continúan visibles e independientes.
