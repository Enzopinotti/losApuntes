# Mobile — editar título, descripción y etiquetas de un recurso propio

## Contrato de producto

La pantalla **Recurso → Editar mi apunte** ofrece edición sólo si el servidor
devuelve `resource.capabilities.edit === true`. No existe elevación local de
permisos: `PATCH /resources/:id` exige autor autenticado en el backend.

Campos editables: título (2–160), descripción opcional (hasta 3000) y hasta
12 etiquetas únicas (máximo 40 caracteres por etiqueta). La materia,
adscripción, archivo binario, autoría y visibilidad **no** se modifican en
este flujo. Borrar toda la descripción envía `null`; borrar las etiquetas
envía `[]`. Los campos no alterados no se incluyen en el cuerpo.

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
6. Comprobar VoiceOver/TalkBack, teclado, foco, mensajes de error y botones
   deshabilitados en iOS/Android.

## Alcance de validación

La entrega solicitada se integra con commits `[skip ci]`, sin ejecutar
GitHub Actions. Los tests unitarios están agregados al repositorio, pero
quedan **sin ejecución certificada**; tampoco hay aceptación en un
dispositivo físico ni garantía de compilación nativa hasta la revisión.
