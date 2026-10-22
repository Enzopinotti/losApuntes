# B217 — idiomas e intereses en perfiles públicos Mobile

## Problema

El servidor ya devuelve las habilidades, los intereses y los idiomas habilitados para el perfil público, pero Mobile solo mostraba las habilidades.

## Comportamiento

- Muestra intereses e idiomas cuando contienen datos publicados.
- Usa el mismo tratamiento visual que las habilidades y conserva el texto del servidor.
- No muestra filas vacías ni deriva contenido adicional.

## Alcance

La pantalla consume solo `profile.skills` de la proyección pública del servidor; no lee el perfil privado ni las preferencias del usuario.

## Aceptación

- Intereses e idiomas aparecen con etiquetas claras cuando están presentes.
- Campos vacíos u omitidos no dejan espacios ni mensajes redundantes.
- Los datos existentes de habilidades mantienen su comportamiento.
