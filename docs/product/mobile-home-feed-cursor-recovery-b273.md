# B273 — Recuperación de cursores cíclicos en Inicio Mobile

## Problema

Inicio Mobile podía detener una respuesta cuyo cursor siguiente repetía el cursor actual, pero no un ciclo de varias páginas (por ejemplo, `A → B → A`). El feed podía volver a solicitar páginas ya consumidas y la pantalla conservaba un cursor que no permitía avanzar.

## Comportamiento

- El controlador registra los cursores que completaron una página válida, con historial separado para el feed de Inicio y Para ti.
- Si la respuesta propone el cursor actual o uno consumido antes en el mismo feed, conserva los elementos ya cargados, no aplica la página cíclica y pide actualizar Inicio para comenzar una tanda nueva.
- Una carga fallida o una página inválida no consume el cursor; las fallas transitorias se pueden reintentar.
- Un Inicio nuevo o la invalidación de sesión descarta los historiales anteriores. Un ciclo detectado bloquea solicitudes adicionales de esa tanda hasta actualizarla.

El historial es temporal, acotado por la sesión de feed y no contiene datos del usuario. No cambia contratos de API, clasificación, permisos ni persistencia.

## Evidencia local

- Pruebas del controlador de Inicio: cubren repetición y ciclo en ambos feeds, aislamiento entre sus historiales, reinicio de sesión, conservación de contenido y bloqueo hasta actualizar.
- TypeScript de Mobile, Prettier focalizado y `git diff --check`.
