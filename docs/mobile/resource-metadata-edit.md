# Mobile — editar datos y visibilidad de un recurso propio

## Contrato de producto

La pantalla **Recurso → Editar mi apunte** ofrece edición sólo si el servidor
devuelve `resource.capabilities.edit === true`. No existe elevación local de
permisos: `PATCH /resources/:id` exige autor autenticado en el backend.

Campos editables: título (2–160), descripción opcional (hasta 3000) y hasta
12 etiquetas únicas (máximo 40 caracteres por etiqueta). La
**visibilidad** también puede modificarse entre Privado, Compartido y Público,
con confirmación expresa cuando cambia el alcance. La materia,
adscripción, archivo binario y autoría **no** se modifican en este flujo. Borrar toda la descripción envía `null`; borrar las etiquetas
envía `[]`. Los campos no alterados no se incluyen en el cuerpo.

## Contrato de visibilidad y permisos

El backend usa `visibility` con tres valores:
- **Privado (`private`):** sólo la persona autora puede consultar el apunte.
- **Compartido (`shared`):** lo pueden consultar la persona autora y
  las personas con permisos explícitos registrados en el servidor.
  Cambiar a Compartido **no concede permisos automáticamente**, ni habilita
  un formulario de invitaciones en este bloque.
- **Público (`public`):** cualquier persona autorizada a consultar recursos
  públicos puede abrirlo; es un aumento significativo de exposición.

La implementación vigente de `ResourceStore.updateOwned` **elimina
atómicamente los permisos individuales al salir de Compartido**.
Al volver a Compartido esos permisos **no se restauran**. La UI expone
esta consecuencia antes de guardar y exige una confirmación accesible,
por separado de la selección de visibilidad.

La capacidad `resource.capabilities.edit` sólo gobierna qué aparece en
Mobile; el backend verifica nuevamente que la persona autenticada sea
autora. El cambio de visibilidad utiliza el mismo `PATCH /resources/:id`
con `expectedRevision`; no se envía un PATCH separado de los demás
campos. El backend no amplía permisos durante este bloque.

## Concurrencia y evidencia del servidor

Cada PATCH incluye `expectedRevision` obtenido del detalle autorizado.
El backend rechaza una edición hecha sobre una revisión obsoleta
(`RESOURCE_REVISION_CONFLICT`). La interfaz no guarda cambios de forma
optimista ni repite automáticamente un PATCH ambiguo.

- **Éxito confirmado:** el backend devuelve el recurso con revisión superior
  y los campos solicitados. Se vuelve a leer el detalle para actualizar la
  pantalla.
- **Conflicto:** se consulta el detalle actual y se pide revisar la nueva
  versión antes de volver a editar.
- **Timeout, pérdida de conexión o error desconocido:** se intenta verificar
  con GET. Si no se puede determinar el resultado, el formulario queda
  bloqueado hasta que el usuario consulte explícitamente el estado actual.
- **Cambio de cuenta/recurso o app en segundo plano:** se aborta la operación,
  se descartan respuestas tardías y no se atribuyen cambios al usuario
  equivocado.

Las URLs firmadas de archivos nunca se envían como parte de los metadatos.

## Manual QA — pendiente

1. Con un recurso propio, modificar únicamente el título; confirmar revisión
   incrementada tras recargar. Verificar también descripción vacía y etiquetas
   eliminadas.
2. Confirmar que un recurso ajeno no muestra el editor. Probar PATCH directo
   sin autoría: el backend debe rechazarlo.
3. Cambiar el mismo recurso desde Web mientras Mobile mantiene un formulario
   antiguo; Mobile debe presentar conflicto y no pisar la versión nueva.
4. Cortar la red inmediatamente después de Guardar; comprobar que no se
   muestra éxito sin confirmación y que no ocurre un PATCH duplicado.
5. Cambiar de sesión y pasar a segundo plano durante la operación; la
   respuesta anterior no debe modificar el nuevo contexto.
6. Cambiar Privado → Público: advertencia visible, confirmación separada y
   nueva revisión pública sólo luego de un PATCH confirmado.
7. Cambiar Compartido → Privado/Público con una persona autorizada: verificar
   que las concesiones explícitas se invaliden y **no reaparezcan** al
   volver a Compartido.
8. Cambiar Privado → Compartido: verificar que ningún tercero gane acceso
   sin recibir primero permiso explícito del backend.
9. Probar un conflicto de visibilidad en dos dispositivos; confirmar que
   Mobile no sobreescriba la elección remota ni muestre éxito falso.
10. Comprobar VoiceOver/TalkBack, teclado, foco, mensajes de error, radio
    buttons, confirmación y botones deshabilitados en iOS/Android.

## Alcance de validación

La entrega solicitada se integra con commits `[skip ci]`, sin ejecutar
GitHub Actions. Los tests unitarios están agregados al repositorio, pero
quedan **sin ejecución certificada**; tampoco hay aceptación en un
dispositivo físico ni garantía de compilación nativa hasta la revisión.
