# B177 — Encontrar apuntes dentro de Mis kits de estudio

Carrier code-only preparado sobre `origin/main` `35fb5410107403d35ede619fb839961609a77704`. Se conservaron los trece commits funcionales, de prueba y documentación; se excluyó el commit dedicado al workflow. El bloque no incluye deploy ni habilita acceso persistente.

## Problema que resuelve

Antes de B177, la sección «Agregar apuntes visibles» de Mis kits de estudio sólo dejaba recorrer páginas cargadas de Guardados y del catálogo por materia. El alumno que sabía que existía un archivo (por ejemplo «Integrales definidas») tenía que avanzar manualmente por sucesivas páginas para encontrarlo y agregarlo al kit del parcial.

## Recorrido nuevo

1. Ingresar a **Mesa de estudio → Mis kits de estudio** con una materia actual válida.
2. Seleccionar un kit o crear uno.
3. En **Encontrar un apunte específico**, escribir una palabra del título, descripción o etiqueta (2 a 120 caracteres).
4. **Buscar apuntes** hace una consulta acotada a la materia que devolvió Contextual Discovery, con los controles de visibilidad actuales de Resources.
5. Elegir **Agregar al kit** en un resultado. El kit usa el mismo modelo y límites actuales; no se genera ninguna suscripción ni concesión de permisos.
6. Paginación con **Más resultados de búsqueda** sin volver a consultar las páginas generales. **Limpiar búsqueda** deja de mostrar resultados previos. La biblioteca habitual de Guardados sigue disponible en paralelo.

## Semántica y seguridad

- La búsqueda es **explícita**, nunca un fetch por tecla.
- Se reutiliza `GET /resources?q=...&subjectId=...&limit=25` del backend de `main`, sin alterar contrato o dependencias.
- `q` usa el rango del `ResourceSearchDto`: 2–120 caracteres después de trim. Los controles y búsquedas malformadas no se envían ni se convierten en consulta global inadvertida.
- Toda respuesta se filtra defensivamente por materia además del filtro del servidor; no se mezclan IDs de otro Subject.
- Scope de request por usuario, sesión, materia y búsqueda. Respuestas anteriores no pueden reemplazar resultados de otra búsqueda, y el componente se desmonta al cambiar kit/materia.
- Se usa el guard actual de duplicados y límite `STUDY_KIT_MAX_RESOURCES`, además del validador del modelo al modificar el kit.
- Los resultados no se guardan en el archivo JSON exportable del kit: se persisten únicamente los IDs de materiales que el usuario eligió.
- La verificación de accesos sigue ejecutándose al ver, importar y pasar un kit al Planificador. Ningún resultado de búsqueda implica acceso futuro.
- El panel general de recursos sugeridos y guardados no cambia su carga, paginación ni condiciones de reintento.

## Criterios de aceptación

- Buscar «integrales» dentro de Álgebra devuelve únicamente apuntes autorizados de Álgebra aunque las primeras páginas no los incluyan.
- Cambiar de consulta o materia durante una petición invalida resultados anteriores, incluso si la red responde fuera de orden.
- Un texto de 1 o 121 caracteres no dispara API; se muestra orientación útil.
- Resultado vacío / error / timeout / segunda página mantienen estados comprensibles.
- Agregar la misma referencia de nuevo no produce duplicación ni supera 24 apuntes por kit.
- Un usuario que pierde acceso no puede abrir un archivo por haberlo visto en la búsqueda.
- La herramienta funciona con teclado y pantallas móviles.
- `pnpm test:web-study-kits-integration`: PASS; cubre parsing adversarial, scope, transporte, vinculación y límites. Quedó conectado al `pnpm test` general.
- `pnpm test:web-study-kits-resource-search-browser`: PASS en Chromium con viewport móvil y lecturas API simuladas en loopback. Comprueba búsqueda explícita, filtrado de materia, paginación/deduplicación, agregado local, revalidación de acceso revocado y ausencia de escrituras API.
- Web `check:types`, `lint`, `format:check` y `build`: PASS; build conserva los avisos existentes de Sass y tamaño de chunk. No se ejecutó CI manualmente.

La prueba browser no sustituye una aceptación contra un servicio API desplegado.

## Release

La auditoría productiva local permanece bloqueada por 2 HIGH (`node-forge`, `braces`) y 3 MODERATE; el HIGH de `follow-redirects` dejó de aparecer tras el parche integrado. Release #353 continúa HOLD. Sin waiver ni autorización de deploy.
