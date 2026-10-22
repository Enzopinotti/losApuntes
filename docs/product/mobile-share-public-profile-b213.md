# B213 — compartir un perfil público desde Mobile

## Problema

Mobile permitía abrir perfiles públicos desde varios resultados, pero no ofrecía una acción para compartir el perfil con otra persona.

## Comportamiento

- El perfil muestra una acción explícita que abre el menú nativo de compartir.
- El contenido compartido es sólo `losapuntes:///profiles/:profileId`; la app abre el perfil mediante su ruta existente y vuelve a consultar los permisos al cargarlo.
- El helper acepta únicamente UUID v4 canónico, en minúsculas, como el que admite el endpoint. IDs inválidos no generan una acción.
- Si el menú nativo falla, la pantalla conserva el perfil y presenta un error recuperable.

## Alcance

No comparte datos privados, nombre, email, tokens, credenciales ni estado de sesión. No agrega URL web ni persistencia; el usuario siempre elige iniciar el envío desde el menú del sistema.

## Aceptación

- El deep link llega a la ruta pública de perfil ya registrada.
- IDs malformados o con segmentos/query inyectados se rechazan.
- Compartir sólo ocurre por acción directa y transporta el identificador público necesario para abrir el perfil.
