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
