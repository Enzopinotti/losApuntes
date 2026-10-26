# B227 — confirmar eliminación de actividades

## Problema

“Mi perfil” eliminaba una actividad inmediatamente al pulsar el botón, aunque la acción no se puede deshacer desde la interfaz.

## Comportamiento

- Antes de borrar, muestra un diálogo accesible con el nombre de la actividad.
- La persona puede conservarla o confirmar la eliminación.
- Al cerrar el diálogo, el foco vuelve al botón que lo abrió.
- La petición conserva el control de revisión optimista existente.

## Aceptación

- Cancelar nunca llama al endpoint de eliminación.
- Confirmar elimina la actividad indicada y actualiza el perfil desde el servidor.
- El diálogo explica que la actividad dejará de aparecer en el perfil público.

## Revisión de integración

El escenario Chromium del propietario confirma que el diálogo nombra la actividad,
coloca el foco inicial en Conservar y no elimina al abrir. Tanto Conservar como
Escape cierran sin escritura y devuelven el foco al botón que abrió el diálogo.
Confirmar produce una sola petición DELETE con el identificador y revisión
observada (6), y la relectura del servidor elimina la fila de la pantalla.

El escenario mantiene cobertura de edición, conflictos, URLs, avatar,
presentación y orden. Las operaciones se simulan localmente.
Sin ejecutar ni reintentar CI.
