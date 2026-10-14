# Búsqueda Web: enlaces compartibles y navegación directa

**Alcance:** capacidad de descubrimiento de recursos, materias y perfiles públicos. No cambia endpoints, autorización del recurso, rankings ni límites del backend.

## Experiencia del estudiante

1. En **Buscar**, escribir un término de 2 a 120 caracteres y elegir **Todo**, **Apuntes**, **Materias** o **Personas**.
2. Al enviar, la URL pasa a `/search?q=...` (más `scope=...` cuando el alcance no es Todo). El texto de búsqueda **no se publica en la URL mientras se escribe**.
3. El botón **Copiar enlace de búsqueda** permite volver a la consulta o enviarla a otra persona. El enlace contiene el texto introducido por el usuario y el alcance público; **no contiene sesión, identidad del usuario ni datos privados del resultado**. Evitar compartir consultas sensibles.
4. Abrir la URL, recargar o usar Atrás/Adelante vuelve a consultar la API usando los parámetros validados del enlace; no se preservan snapshots privados del usuario en almacenamiento local.
5. **Ver recurso** en un resultado ahora abre `/resources/:resourceId`, no una segunda búsqueda textual aproximada. El servidor revalida visibilidad, acceso y descarga del recurso exacto.
6. Las secciones de recursos recientes por materia también abren el recurso exacto. Los filtros por materia siguen usando el identificador canónico y las personas se vinculan mediante Profile UUID público.

## Robustez

- Se rechazan enlaces sin consulta válida, con consultas de longitud distinta de 2–120 o caracteres de control. Un alcance desconocido se restringe a la búsqueda pública `all`.
- Las respuestas se vinculan a la combinación de cuenta/sesión + consulta enviada. Al cambiar sesión, término enviado o categoría, los resultados anteriores no se muestran y las solicitudes previas se invalidan con `useAsyncAuthorityFence`.
- Los borradores del campo de búsqueda se mantienen separados de la URL. Una búsqueda idéntica permite reintentar y un error de red muestra una acción **Reintentar búsqueda**.
- La copia al portapapeles se activa sólo al tocar el botón y falla con un mensaje recuperable cuando no está disponible.
- Las URLs compartibles son públicas: la persona destinataria solo verá material que pueda consultar; el enlace no autoriza contenido privado.

## Evidencia

La prueba existente `node scripts/test-web-search-contract.mjs` incluye now casos de decodificación/serialización de URLs, escapado de caracteres reservados, alcances desconocidos, consultas duplicadas/incorrectas, identidad de la selección y contrato de navegación directa. Continúan vigentes las comprobaciones de cookies, cache no-store, timeouts y fence asíncrono.

La aceptación final requiere CI exact-head, navegación manual desde una búsqueda a un apunte y vuelta, refresco de enlace con filtros, error de red/reintento y copia del enlace en navegador. No se reclama browser-E2E por la prueba estática.
