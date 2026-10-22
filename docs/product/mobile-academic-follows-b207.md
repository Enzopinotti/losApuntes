# Mobile B207 — seguir instituciones y carreras

Mobile suma una pantalla para consultar los seguimientos académicos de la
cuenta, buscar instituciones o carreras activas en el catálogo y seguirlas o
dejarlas de seguir. La pantalla se abre desde la tarjeta de contexto académico
y usa las rutas existentes `GET /academic/me/follows`,
`PUT /academic/me/follows/:nodeId` y
`DELETE /academic/me/follows/:nodeId`.

La lista y las mutaciones obtienen la credencial de la sesión vigente; el
cliente no recibe un identificador de cuenta. La búsqueda pública pide al menos
dos caracteres, permite recorrer cursores opacos y solo conserva opciones
activas del tipo consultado. Después de una mutación se vuelve a leer la lista
del servidor para confirmar el estado. La pantalla cancela lecturas, búsquedas y
mutaciones al perder foco, suspender la app o cambiar la autoridad de sesión.

La API de follows limita la lista visible a 100 relaciones y devuelve
`truncated`; Mobile lo comunica sin presentar esa ventana como completa. Los
datos se reconstruyen desde campos permitidos y se rechazan IDs fuera del
formato UUIDv4, nombres vacíos, clases inesperadas o filas duplicadas.

La validación local cubre la forma del transporte, la autoridad de sesión, la
cancelación de búsquedas obsoletas, la paginación del catálogo, la reconciliación
posterior a mutaciones, el typecheck móvil, los 714 tests móviles, el formato,
la higiene del repositorio y la exportación Expo para iOS y Android. No agrega
endpoints, dependencias, permisos ni cambios a workflows.
