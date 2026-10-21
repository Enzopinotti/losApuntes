# B179 — Llevar un apunte directamente al Planificador de estudio

Estado: **candidato Web (PR Draft); no integrado ni desplegado**.

## Problema

El recorrido de estudio desde una búsqueda era innecesariamente largo: abrir un apunte desde Recursos, reconocer que sirve para un parcial, volver a la Mesa, seleccionar materia, entrar al Planificador y volver a encontrar el recurso. El Planificador ya tenía un mecanismo de transferencia temporal desde Práctica y Kits, pero no desde Recursos.

## Comportamiento implementado

En la **ficha individual** `/resources/:resourceId`, un usuario autenticado ve **«Preparar sesión con este apunte»** junto a las acciones actuales. No se presenta en listados genéricos, para evitar peticiones por cada recurso visible.

Al pulsar:

1. El cliente vuelve a consultar `GET /resources/:id` para obtener el estado actual del recurso, y `GET /discovery/contextual?subjectLimit=8&resourcesPerSubject=1` para comprobar materias actuales.
2. Se exige identidad de recurso, UUID v4 y pertenencia a una de las primeras ocho materias actuales devueltas por el servidor. Un identificador público o el título que aparecía en un resultado no conceden acceso a una materia.
3. Se genera un plan temporal con **una actividad pendiente de 25 minutos**. No se copian título, archivo, autor, enlaces firmados ni grants.
4. Se utiliza `createStudyHandoff` vigente para navegar al Planificador con un nonce opaco de una sola vez, acotado a usuario/sesión/materia, con vencimiento de diez minutos.
5. El Planificador verifica nuevamente cada actividad y deja al estudiante **sumarla sin perder su plan** o **reemplazar el borrador**, con confirmación cuando corresponde. Ningún apunte se agrega automáticamente ni se guarda en el servidor durante el pase.

Si el apunte no es de una materia actual, se explica que debe elegirse una materia desde la Mesa. Un error de permisos o red no se convierte en un éxito aparente. Pulsaciones repetidas no envían acciones concurrentes. Las respuestas tardías no navegan tras cambio de autoridad.

## Seguridad y límites

- Sin cambiar `Resources API`, `StudySession`, DTO, esquemas Mongo, modelo de roles, grants, dependencias ni variables de release.
- Sólo el navegador que inició la acción conserva el plan y sólo durante el TTL. La URL tiene `subjectId` validado; el `location.state` contiene únicamente `kind`, `version` y `token`.
- No se trasladan nombres privados, archivos o credenciales. El Planificador vuelve a hacer `resourcesApi.get` y verifica la materia.
- La UI se muestra sólo para sesión autenticada y detalle que coincida con el recurso renderizado. Contextual Discovery valida la materia **al pulsar**, no sólo cuando se cargó la ficha.
- No se presume que un apunte en materia pública forme parte de una cursada actual.
- Se mantiene la restricción actual de ocho materias devueltas por Contextual Discovery; si el usuario tiene más, el recorrido normal desde la Mesa sigue disponible.

## Pruebas

- `pnpm test:web-resources-contract`: restricción a ficha, sesión, autoridad y ausencia de storage persistente del handoff.
- `node scripts/test-web-study-handoff-integration.mjs`: plan privado de un recurso, identidad/materia rechazada, scope por usuario/sesión, nonce sin metadatos, uso único y expiración.
- Node 24 exact-head: `pnpm --filter @losapuntes/web check:types`, `lint`, `format:check`, `build` y calidad general.

## Aceptación pendiente

1. Usuario autenticado abre recurso de materia actual y entra al Planificador con una tarea de 25 minutos.
2. Decide sumar al plan existente y no pierde notas ni tareas ya revisadas.
3. Un recurso de otra materia o inaccesible produce un error explicativo, nunca creación silenciosa.
4. Cambiar de usuario o cerrar sesión mientras carga no abre el plan ni hereda un token.
5. Transferencia vencida/consumida no se puede reutilizar.
6. Vista anónima y listado general de recursos no ejecutan la preparación.
7. Funciona con teclado, viewport móvil, red lenta y errores 401/403/404.

**Release:** candidato exact-head, pruebas en navegador + API real y producción audit antes de Ready; #353 permanece HOLD debido a vulnerabilidades HIGH de node-forge, braces y follow-redirects. No waiver ni merge/deploy anticipado.
