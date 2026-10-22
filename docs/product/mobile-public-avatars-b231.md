# Renderizador seguro de avatares públicos en Mobile

Home, Search, autores de la comunidad, perfiles seguidos y conexiones reutilizan
`PublicAvatar`. El componente conserva los tamaños visuales de cada superficie,
valida HTTPS y credenciales antes de solicitar una imagen y muestra la inicial
si la URL falta o la carga falla.

Esta política compartida evita que el feed de Home cargue directamente URLs de
avatar sin la validación que ya usan las superficies sociales.

Las pruebas de política y cableado corren dentro de
`pnpm --filter @losapuntes/mobile test`.
