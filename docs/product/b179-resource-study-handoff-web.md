# B179 — Llevar un apunte directamente al Planificador de estudio

Estado: **candidato Web de integración, preparado sobre `origin/main` `f06502e62d16d0c3f67d81abb9bacde0cd5c3cca`; no integrado ni desplegado**.

La rama de integración conserva los trece commits funcionales y de prueba del bloque B179. Se excluyó el commit que sólo añadía un workflow dedicado: este cambio no modifica `.github/workflows/`. No se lanzó CI manualmente; GitHub puede ejecutar los controles configurados al publicar la PR.

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

- `pnpm test:web-resources-contract`: PASS; restringe la función a la ficha, exige sesión y autoridad, y comprueba que el handoff no se guarda persistentemente.
- `pnpm test:web-study-handoff-integration`: PASS; verifica plan privado, rechazos de identidad/materia, scope por usuario/sesión, nonce sin metadatos, uso único y expiración. También quedó conectado al `pnpm test` del repositorio.
- `pnpm test:web-study-handoff-b179-browser`: PASS en Chromium; con lecturas API simuladas en loopback cubre el paso desde la ficha, estado opaco en navegación, opciones de sumar/reemplazar, cero escrituras API y rechazo de una materia no actual. No reemplaza una prueba contra un servicio desplegado.
- Sobre la rama actual: instalación congelada de los filtros Web/API, `pnpm --filter @losapuntes/web check:types`, `lint`, `format:check` y `build`: PASS. El build conserva avisos existentes de Sass y tamaño de chunk.
- No se ejecutó CI manualmente. Los controles de la PR, si se activan, corresponden a GitHub.

## Alcance de aceptación local

La aceptación local cubre el traspaso a la revisión del Planificador y la autorización al momento de preparar. La elección final de sumar o reemplazar pertenece al flujo existente del Planificador; el nuevo flujo no escribe ni modifica el plan antes de esa elección. El navegador de prueba usa lecturas API simuladas; la comprobación contra un servicio desplegado queda fuera de este bloque de integración.

**Release:** la auditoría local de producción sigue reportando vulnerabilidades HIGH en `node-forge` y `braces` (más advisories MODERATE); `follow-redirects` ya no aparece entre los HIGH. #353 permanece HOLD por las vulnerabilidades abiertas. No se concedió waiver ni autorización de release/deploy con este cambio.
