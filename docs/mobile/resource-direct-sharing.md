# Mobile — permisos individuales de apuntes compartidos

## Objetivo

Un autor de Los Apuntes puede abrir uno de sus recursos, seleccionar
**Compartido** en Editar mi apunte y, en **Compartir con personas**, buscar
destinatarios reales, concederles acceso o revocar su acceso explícitamente.

Este bloque **no envía archivos por fuera de Los Apuntes** ni genera enlaces
públicos a contenido privado. Reutiliza el modelo de recursos existente.

## Fuente de verdad y permisos

- El listado de resultados procede de la búsqueda de personas autenticada
  `search({q, scope: 'people'})`. El servidor limita la respuesta a ocho
  resultados y exige entre 2 y 120 caracteres de consulta. La UI no
  interpreta texto libre como un ID de perfil.
- `PUT /resources/:id/shares/:profileId` concede acceso de modo
  idempotente solo al autor cuando el recurso está en `shared`. El servidor
  no permite auto-compartir al perfil autor.
- `DELETE /resources/:id/shares/:profileId` revoca el permiso para la
  persona elegida, cuando existe. Es idempotente, requiere que el usuario
  autenticado sea propietario y no implica cambiar la visibilidad.
- El backend vuelve a verificar autoría, visibilidad y existencia de los
  perfiles. Antes de un PUT/DELETE, el cliente también relee el recurso y
  comprueba que la revisión y visibilidad coincidan con la pantalla.
- Si el recurso pasa a Privado o Público, MongoDB elimina atómicamente todas
  las concesiones individuales anteriores. Volver a Compartido **no las
  restaura**. El bloque anterior ya exige confirmar este efecto al modificar
  visibilidad.

## Listado real de concesiones del recurso

`GET /resources/:id/shares?limit=20&cursor=...` permite a la persona
**autora con sesión autenticada y correo verificado** consultar las
concesiones vigentes, solo si el recurso sigue en estado `shared`.
La ruta responde con cabecera `Cache-Control: private, no-store`.
No existe ruta pública ni vista de permisos para otros estudiantes.

La respuesta contiene `items` con `profileId`, `displayName`,
`avatarUrl`, `grantedAt`, más `nextCursor` y `resourceRevision`.
**Nunca incluye `userId` interno, correo electrónico ni un token de
archivo.** El servicio de perfiles aplica sus reglas de privacidad:
cuando el nombre público no puede mostrarse, se utiliza
«Usuario de Los Apuntes» y no se expone el avatar.

El backend limita cada página a **1–50 registros** (por defecto 20) y
continúa con un cursor asociado al recurso y su revisión. El cursor
incluye la posición del documento de permiso en MongoDB, **no** el
identificador interno del destinatario. Si cambia la revisión o se
consulta el cursor en otro recurso, se rechaza y es necesario
recargar el detalle y reiniciar la paginación.

La pantalla muestra los accesos cargados, indica cuando hay más
páginas, permite seleccionar una persona de la lista y revocarle
acceso mediante el mismo DELETE autorizado y con confirmación.
También mantiene la búsqueda de destinatarios del bloque anterior
para conceder acceso a nuevos perfiles.

**Limitación residual:** el listado es paginado y está sujeto a
cambios concurrentes en los permisos. No constituye una fotografía
transaccional de todos los grants durante todas las páginas;
los botones de actualización y las revisiones permiten volver a
consultar su estado. No se guarda una copia persistente en el móvil.

## Autoridad y seguridad del cliente

- La UI aparece solo cuando `resource.capabilities.manageShares` es true.
- El controlador también comprueba esa capacidad y el estado Compartido.
- Ningún usuario se selecciona por un ID tipeado a mano: se selecciona un
  `profileId` procedente de la búsqueda autenticada o del listado de
  concesiones autorizado por el backend.
- Se excluye el perfil del autor y se deduplican perfiles repetidos.
- Al modificar texto de búsqueda se descarta la selección anterior.
- Al cambiar recurso, revisión o autoridad de sesión se cancelan búsquedas
  y mutaciones pendientes. Las respuestas tardías no se aplican a otro
  usuario o apunte.
- Si una operación de red es ambigua no se muestra éxito. No se ejecutan
  reintentos automáticos de PUT/DELETE. El usuario debe comprobar su
  situación antes de realizar otra operación.
- Si la lectura previa a PUT/DELETE detecta una **revisión obsoleta** o
  visibilidad distinta, se bloquean búsquedas y mutaciones hasta que
  el autor pulse **Actualizar apunte**, que solicita un detalle nuevo
  desde el backend. Ningún permiso se modifica durante ese bloqueo.
- Revocar exige una confirmación separada de la selección del perfil.
- El acceso a archivos permanece sujeto a la autorización del backend;
  compartir no almacena ni distribuye URLs firmadas en el dispositivo.

## Pruebas manuales pendientes

1. Con autor autenticado, cambiar un apunte a Compartido. Buscar el nombre
   de otra persona, seleccionarla y concederle acceso.
2. Desde la cuenta receptora, abrir el recurso con permiso y verificar que
   otro usuario sin concesión no puede abrirlo.
3. Volver a la cuenta autora, buscar el perfil receptor, confirmar revocación
   y comprobar que el acceso del receptor deja de funcionar.
4. Repetir PUT y DELETE sobre la misma persona, verificando idempotencia.
5. Cambiar Compartido → Privado → Compartido y confirmar que las
   concesiones antiguas NO se restauran.
6. Verificar que no aparecen controles de concesión para un recurso ajeno,
   privado o público.
7. Buscar el propio perfil del autor; no debe poder seleccionarse para
   auto-compartir. Consultas inválidas no deben enviarse a búsqueda.
8. Interrumpir la conexión mientras se busca o modifica un permiso;
   verificar que no aparezcan confirmaciones falsas ni reintentos
   automáticos.
9. Cambiar de cuenta y enviar la app a segundo plano durante mutaciones;
   verificar aislamiento de respuestas tardías.
10. Probar acceso por teclado, VoiceOver/TalkBack, botón de búsqueda,
    radios de selección y checkbox de confirmación en Android e iOS.

11. Consultar lista de accesos desde la cuenta autora y cargar más
    de 20 concesiones. Verificar nombres privados, avatar oculto y que
    no se vea `userId`, correo ni IDs internos en los datos de la página.
12. Abrir directamente una cuenta ajena sin autoría y solicitar
    `GET /resources/:id/shares`; la respuesta no debe revelar
    destinatarios. Probar además recurso Privado y Público.
13. Cambiar visibilidad o revisión entre páginas y comprobar que el
    cursor antiguo no sigue siendo aceptado.
14. Revocar a una persona elegida desde la lista y confirmar que deja
    de aparecer después de actualizar los accesos.

## Calidad e integración

Los tests automatizados acompañan la rama, pero la integración solicitada
se hace con `[skip ci]`: no se afirma que hayan pasado TypeScript, formato,
builds o aceptación nativa. La auditoría general de dependencias de
producción continúa como bloqueo de release separado.
