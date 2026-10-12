# Mobile — Mis apuntes (biblioteca de publicaciones propias)

## Problema detectado en el repositorio

Hasta este bloque, la aplicación tenía:

- **Buscar**: resultados públicos o recursos autorizados de múltiples autores.
- **Guardados**: recursos que el estudiante guardó, aunque hayan sido
  publicados por otra persona.
- **Exportación de cuenta**: metadatos históricos, incluyendo recursos
  ocultados por moderación, destinados a portabilidad, no a gestionar
  publicaciones desde Mobile.
- **Detalle de recurso**: edición de metadatos, visibilidad y gestión de
  permisos ya implementadas en los bloques 08–11.

Ninguno ofrece una biblioteca de publicaciones propias desde la que el autor
pueda abrir y administrar sus apuntes sin localizarlos en la búsqueda general.

## Contrato backend

`GET /resources/mine`:

- requiere **sesión autenticada y correo verificado**;
- obtiene el autor del contexto autenticado `request.user.id`, nunca de un
  parámetro suministrado por el dispositivo;
- devuelve `OwnedResourcesPage { items: ResourceView[], nextCursor }`;
- aplica `Cache-Control: private, no-store`;
- permite `visibility=private|shared|public`, `q=...` (2–120
  caracteres), `subjectId=UUID`, `order=newest|oldest` y
  `limit=1..50` (25 por defecto);
- `q` busca en el índice textual precomputado de título,
  descripción y etiquetas. Se normalizan espacios, capitalización
  y formato Unicode; los caracteres especiales se escapan antes de
  formar una expresión regular en Mongo. Es búsqueda literal de
  texto, no coincidencia semántica ni motor full-text;
- `GET /resources/mine/subjects` lista las materias con publicaciones
  disponibles del mismo autor, con nombre académico y conteo. Devuelve
  hasta 50 materias ordenadas por cantidad de publicaciones y
  `truncated=true` si existen más; no afirma que ese subconjunto sea
  exhaustivo;
- ordena por `createdAt DESC, id ASC` (más recientes) o
  `createdAt ASC, id ASC` (más antiguos), con posición de página
  ajustada a la dirección temporal;
- el cursor de continuación incluye la fecha/id y queda ligado a
  **búsqueda, materia, visibilidad y orden**. Un cursor de una
  combinación no sirve para otra. Las páginas v1 del listado anterior
  siguen siendo válidas sin los nuevos filtros;
- la consulta de búsqueda, filtros y paginación siempre se ejecuta
  en el servidor **antes** de aplicar `limit`; no se filtran solo
  los primeros 25 resultados cargados;
- consulta Mongo con `authorUserId` obligatorio y
  `moderationState=available`. Esto evita mezclar resultados de otros
  estudiantes o recursos que no deben visualizarse;
- utiliza `ResourceService.projection` con la identidad del propietario,
  sin otorgar nuevos permisos, URLs firmadas ni datos extra de usuarios.

Los registros ocultados por moderación siguen en la exportación de datos de
la cuenta, pero **no** forman parte de esta biblioteca navegable.
No hay endpoint de eliminación en este bloque.

## Experiencia Mobile

La ruta `/my-resources` se abre desde **Perfil → Mis apuntes**, junto a
**Recursos guardados**. Son conceptos diferentes.

Incluye filtros **Todos / Privados / Compartidos / Públicos**,
búsqueda explícita por título/descripción/etiquetas, navegación horizontal
por materias con conteos, orden **Más recientes / Más antiguos** y
**Limpiar filtros**. La búsqueda se ejecuta al pulsar Buscar o enviar el
teclado (no se hacen peticiones en cada pulsación), y las cadenas de un
solo carácter no se envían.

La pantalla maneja carga inicial, estados vacíos y de error, reintento,
carga de páginas siguientes y acceso al detalle existente
`/resources/[id]`. Ese detalle ya ofrece editar
título/etiquetas/visibilidad y conceder o revocar permisos, según la
capacidad real del autor.

Los conteos al lado de las materias consideran **todas** las
publicaciones disponibles del autor, sin el filtro de visibilidad
seleccionado; no son una estimación de resultados en pantalla.
Si se publicaron recursos en más de 50 materias, el selector muestra
las 50 principales y una advertencia de truncamiento.

Los conteos de pantalla representan **solo los recursos cargados** y no
afirman un total global que el backend no ofrece. Cambiar un filtro provoca
una nueva consulta al servidor, no un filtrado sobre la primera página.
Cuando un apunte se modifica en detalle, volver a entrar a la biblioteca
recarga los datos del servidor.

El controlador evita mezclar respuestas de usuarios/sesiones y filtros:
al suspender la app, salir de la pantalla o cambiar de cuenta aborta la
operación y descarta datos anteriores. El backend verifica nuevamente
permisos al abrir el detalle.

## Alcance y rendimiento

La búsqueda utiliza coincidencia literal sobre `searchText` y un
filtro obligatorio de autor; no agrega datos de otros usuarios ni
modifica visibilidad o permisos. Los filtros por materia aprovechan
índices compuestos del propietario, moderación, materia y fecha.
El término `q` utiliza una expresión regular escapada y debe
evaluarse con `explain()` en colecciones grandes. No se implementa
un buscador semántico ni se atribuyen resultados globales al filtrado
de una página local.

## QA antes de lanzamiento (pendiente)

1. Publicar dos apuntes con un estudiante A: Privado y Público. Ambos deben
   aparecer en **Todos** de A, y solo el Público en su filtro respectivo.
2. Publicar con estudiante B y comprobar que no aparezca en **Mis apuntes**
   de A. Los recursos de B pueden seguir apareciendo en la búsqueda general.
3. Confirmar que **Recursos guardados** mantiene elementos de otros autores
   y no se confunde con **Mis apuntes**.
4. Crear más de 25 recursos, cargar páginas sucesivas y confirmar que no
   aparecen repetidos ni se pierde el orden cronológico.
5. Cambiar de filtro entre solicitudes lentas; comprobar que no aparezcan
   recursos del filtro anterior.
6. Cambiar de cuenta y enviar Mobile a segundo plano; las respuestas
   tardías no deben revelar contenidos de la sesión anterior.
7. Abrir un recurso, modificar el título y la visibilidad, regresar y
   comprobar que una recarga muestra datos actualizados.
8. Probar pérdida de conexión en la primera página y en «Cargar más».
   El error posterior no debe descartar las páginas ya cargadas.
9. Verificar que recursos ocultados por moderación no aparezcan en la
   biblioteca, sin eliminarlos de la exportación histórica.
10. Validar accesibilidad y foco con TalkBack/VoiceOver en iOS y Android.
11. Verificar índices compuestos `{ authorUserId, moderationState,
    createdAt, id }` y `{ authorUserId, moderationState, subjectId,
    createdAt, id }` en MongoDB del entorno.
12. Buscar un título que aparezca en la página 4 de publicaciones:
    debe encontrarse sin cargar manualmente las páginas 1–3.
13. Buscar por descripción y etiquetas, con acentos y mayúsculas;
    verificar que se escapen metacaracteres como `+` y `(`.
14. Elegir una materia con recursos privados/compartidos/públicos,
    filtrar por visibilidad y comprobar que ambos filtros se respetan.
15. Ordenar por Más antiguos, cargar varias páginas, y comprobar el
    orden inverso por fechas sin duplicados.
16. Cambiar búsqueda, orden o materia mientras se carga otra página:
    no deben mezclarse respuestas ni reciclar cursores anteriores.
17. Para una cuenta con más de 50 materias, comprobar la advertencia
    de selector limitado; no presentar sus opciones como todas las
    materias de la cuenta.
18. Validar acceso de otra cuenta a `GET /resources/mine/subjects`:
    solo debe recibir materias del usuario de su propia sesión.

## Estado técnico

Por solicitud expresa, los commits se preparan con `[skip ci]` y se
integran vía PR con historial atómico y comentario de revisión. **Los tests
agregados no se consideran ejecutados**, ni están validados lint, formato,
compilación Expo/API y QA física hasta correrlos por separado. La auditoría
de dependencias global pendiente sigue fuera del alcance de esta función.
