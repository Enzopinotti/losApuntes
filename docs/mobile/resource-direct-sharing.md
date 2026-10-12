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

## Limitación de la API actual

**No existe un endpoint para listar o consultar las concesiones vigentes de
un recurso.** La pantalla no muestra un supuesto listado exhaustivo de
personas autorizadas ni un indicador de estado por perfil derivado de un
almacenamiento local. Solo informa lo que el servidor haya confirmado
**durante la interacción actual** con el perfil seleccionado.

Por ese motivo, la revocación trabaja sobre un **perfil buscado y elegido
explícitamente**; no necesita asumir que el permiso exista antes. Una
respuesta HTTP confirmada de DELETE permite afirmar que la solicitud de
revocación terminó, no reconstruir el histórico de permisos.

Esta limitación debería abordarse en otro bloque mediante un endpoint GET
autorizado, con política de privacidad, paginación y tests de backend.

## Autoridad y seguridad del cliente

- La UI aparece solo cuando `resource.capabilities.manageShares` es true.
- El controlador también comprueba esa capacidad y el estado Compartido.
- Ningún usuario se selecciona por un ID tipeado a mano: se selecciona un
  `profileId` procedente de la búsqueda autenticada.
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

## Calidad e integración

Los tests automatizados acompañan la rama, pero la integración solicitada
se hace con `[skip ci]`: no se afirma que hayan pasado TypeScript, formato,
builds o aceptación nativa. La auditoría general de dependencias de
producción continúa como bloqueo de release separado.
