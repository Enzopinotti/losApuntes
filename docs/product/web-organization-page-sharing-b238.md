# B238 — Compartir páginas públicas de organizaciones

El detalle Web de una organización puede compartir su URL de origen actual con el menú nativo del navegador. Si no está disponible, copia el enlace al portapapeles; si esa acción tampoco funciona, deja el enlace en un campo seleccionable.

La ruta se crea solo desde un ID UUIDv4 devuelto por la API y se construye en el origen del sitio abierto. No se adjunta sesión ni información privada, y cancelar el menú nativo no copia datos sin que la persona lo pida.

## Validación

- Contrato Web de Organizaciones y pruebas del constructor de enlace.
- Pruebas iCalendar B234 y filtro de eventos B236.
- Build y ESLint Web, formato, higiene y `git diff --check`.

La validación local no sustituye los checks automáticos de GitHub.
