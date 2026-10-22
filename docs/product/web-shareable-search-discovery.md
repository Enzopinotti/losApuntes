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

## Buscar apuntes por materia actual

Con sesión iniciada, el buscador ofrece un filtro **Materia (solo apuntes)** basado en las materias actuales obtenidas del servicio contextual existente. Una persona puede buscar, por ejemplo, `parcial` dentro de `Base de Datos`, sin mezclarse con apuntes de otras materias.

- **Todas las materias** elimina el filtro. La opción seleccionada se conserva en `/search?q=...&scope=resources&subjectId=<UUID v4>` y se puede compartir.
- El filtro aplica **solamente** a la sección Recursos, tanto en alcance `all` como `resources`. Los resultados de Personas y Materias no se alteran y el selector desaparece al escoger esas categorías.
- Las personas que abran un enlace público pueden conservar o quitar la materia, aunque no tengan una cursada activa vinculada. Si la materia no está en su contexto actual, el selector muestra **Materia del enlace** sin exponer datos académicos privados ni intentar inferir el nombre.
- Los UUID se validan como versión 4, se normalizan a minúsculas y los valores ausentes, malformados, duplicados o incompatibles con otro alcance no ejecutan una búsqueda amplia por accidente.
- La selección entra en la identidad de la búsqueda y en su fence asíncrono: respuestas de otra materia, consulta o sesión no pueden reemplazar los resultados nuevos.
- El endpoint de búsqueda y la autorización de archivos permanecen sin cambios. La API continúa validando `subjectId` y el acceso a cada recurso.
- Al abrir **Ver recurso** desde resultados o desde el descubrimiento contextual, `searchReturnTo` debe incluir el mismo `subjectId` canónico de la consulta enviada. La vista de detalle reautoriza el recurso y **Volver a la búsqueda** reconstruye el filtro sin depender de un estado local. Si no hay una consulta válida se conserva el fallback interno `/search`.

### Escenarios de aceptación adicionales

Buscar `parcial` en una materia actual y luego en todas debe consultar los resultados con el filtro correspondiente. Copiar el enlace, abrirlo en sesión anónima, recargarlo y regresar desde el detalle debe conservar el mismo UUID público. Cambiar de `resources` a `people` debe quitar el filtro. Un enlace con `subjectId` manipulado, duplicado o no UUID v4 debe mostrar un error explícito en vez de mostrar recursos fuera del alcance solicitado.

## B190 — Limpiar búsqueda y filtros sin conservar resultados anteriores

**Requisitos existentes:** SEARCH-FR-001, SEARCH-FR-004, NFR-UX-001 y PLAT-FR-007. Esta mejora de cliente no modifica el contrato HTTP, el ranking ni la autorización.

- **Limpiar búsqueda** está disponible cuando el borrador, el alcance, la materia o la URL tienen una selección activa, incluso si el enlace recibido es inválido.
- La acción devuelve el borrador al estado inicial (consulta vacía, alcance Todo y todas las materias) y navega a `/search`, sin volver a ejecutar la consulta anterior.
- También invalida y aborta el request anterior, descarta la proyección de resultados y el aviso de copia de enlace. No altera la sesión ni el descubrimiento contextual del usuario.
- Una respuesta que llegue tarde no debe volver a presentar resultados antiguos. El navegador conserva la navegación anterior mediante su historial; no se agrega persistencia local, telemetría ni nuevos permisos.

**Aceptación:** desde consulta válida, consulta editada sin enviar, filtro de materia activo, búsqueda en curso y enlace inválido, una sola acción deja `/search` sin `q`, `scope` ni `subjectId`. El contrato estático prueba el control visible, la limpieza del borrador, la invalidación explícita y la navegación; la UX final requiere verificación manual en navegador.

## B193 — Copiar enlace directo a un recurso desde Buscar

**Recorrido:** en cada resultado de apuntes con ID UUIDv4 canónico se muestra **Copiar enlace** junto a **Ver recurso**. Se copia únicamente `/resources/:resourceId` en el origen actual, no una búsqueda, texto privado, nombre, sesión o capacidad de acceso. El destinatario debe superar las autorizaciones normales de detalle y descarga, inclusive si el archivo cambia de visibilidad después de copiar.

**Defensas:** el helper rechaza IDs malformados, rutas arbitrarias, parámetros de URL, orígenes no HTTP(S) y orígenes con ruta/credenciales. No hay endpoints, preferencias, telemetría ni almacenamiento nuevos. El botón requiere activación explícita; no se auto-copia al renderizar. El resultado accesible se muestra sólo para el recurso y combinación actual de consulta/sesión. Si el navegador no permite escribir en el portapapeles, se muestra una recuperación manual.

**Verificación:** `pnpm test:web-search-contract` incluye tests del helper y su integración, junto con `pnpm check`, build Web y QA manual en Chromium con y sin permiso para el recurso. La prueba de código no equivale por sí sola a una aceptación browser E2E. No cambia la condición HOLD del audit de dependencias ni autoriza desplegar.

## B197 — Compartir los apuntes de una materia sin exponer datos propios

**Problema:** la búsqueda Web permite entrar al catálogo de recursos de una materia, pero no compartir ese listado con otra persona sin copiar la barra de direcciones.

**Recorrido nuevo:** junto a **Ver recursos** en cada materia aparece **Copiar enlace de apuntes**. El enlace contiene exclusivamente el UUIDv4 público canónico de la materia bajo `/resources?subjectId=...`. No incluye la consulta de texto, filtros personales, sesión, tokens, información del estudiante ni datos de autor. La página destino usa el filtro de materia ya existente y solicita al backend los recursos que ese visitante está autorizado a ver: el enlace no concede acceso nuevo ni asegura que todos vean los mismos apuntes.

**Seguridad y UX:** el botón sólo aparece con un ID válido; no se ejecuta ninguna copia automática. Se rechazan ID malformados, rutas adicionales, query/fragmentos inyectados y orígenes no HTTP(S) o no exactos. La respuesta del portapapeles se muestra mediante `role=status` y queda vinculada a la consulta/cuenta vigente y a esa materia específica; al restablecer se limpia. Se ofrece instrucción de recuperación si Clipboard API falla y estados de foco visibles con objetivo táctil de 44 px. Los enlaces no persisten en almacenamiento ni generan telemetría.

**Aceptación:** al copiar, abrir en otro navegador o cuenta, verificar que la URL sólo transporta `subjectId` y que los resultados respetan los permisos vigentes. Confirmar que las pruebas adversarias del contrato de búsqueda y `pnpm check` pasan; QA de navegador real y release audit quedan como controles separados. No se modifican API, permisos, dependencias, lockfile ni flags de release.
