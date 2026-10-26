# Renderizador seguro de avatares públicos en Mobile

Home, Search, autores de la comunidad, perfiles seguidos y conexiones reutilizan
`PublicAvatar`. El componente conserva los tamaños visuales de cada superficie,
valida HTTPS y credenciales antes de solicitar una imagen y muestra la inicial
si la URL falta o la carga falla.

Esta política compartida evita que el feed de Home cargue directamente URLs de
avatar sin la validación que ya usan las superficies sociales.

Las pruebas de política y cableado corren dentro de
`pnpm --filter @losapuntes/mobile test`.

## Revisión tras reconciliar con main

La extracción conserva los cambios actuales de Home, Search y Q&A, incluidas
sus acciones de compartir, guardar, colecciones, retorno y paginación. No quedan
referencias al componente o política anteriores. Home mantiene el tamaño de
38 px y las filas sociales el de 44 px.

Suite Mobile completa: 785/785. TypeScript de producto y tests, Prettier afectado
y git diff --check aprobados contra contratos fuente actuales. No se repitió
export nativo ni aceptación en dispositivo para este head.
Sin ejecutar ni reintentar CI.
