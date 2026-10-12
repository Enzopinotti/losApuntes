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
- permite `visibility=private|shared|public` y `limit=1..50` (25 por
  defecto);
- ordena por `createdAt DESC, id ASC` para mantener una paginación
  estable frente a ediciones posteriores;
- usa cursor opaco que incluye la fecha/id de continuación y el **filtro**
  de visibilidad. Un cursor de un filtro no puede usarse en otro;
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

Incluye filtros **Todos / Privados / Compartidos / Públicos**, carga inicial,
estados vacíos y de error, reintento, carga de páginas siguientes y acceso
al detalle existente `/resources/[id]`. Ese detalle ya ofrece editar
título/etiquetas/visibilidad y conceder o revocar permisos, según la
capacidad real del autor.

Los conteos de pantalla representan **solo los recursos cargados** y no
afirman un total global que el backend no ofrece. Cambiar un filtro provoca
una nueva consulta al servidor, no un filtrado sobre la primera página.
Cuando un apunte se modifica en detalle, volver a entrar a la biblioteca
recarga los datos del servidor.

El controlador evita mezclar respuestas de usuarios/sesiones y filtros:
al suspender la app, salir de la pantalla o cambiar de cuenta aborta la
operación y descarta datos anteriores. El backend verifica nuevamente
permisos al abrir el detalle.

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
11. Verificar que el índice `{ authorUserId, moderationState, createdAt,
    id }` se construya en MongoDB del entorno de despliegue.

## Estado técnico

Por solicitud expresa, los commits se preparan con `[skip ci]` y se
integran vía PR con historial atómico y comentario de revisión. **Los tests
agregados no se consideran ejecutados**, ni están validados lint, formato,
compilación Expo/API y QA física hasta correrlos por separado. La auditoría
de dependencias global pendiente sigue fuera del alcance de esta función.
