# Mobile — compartir enlaces desde Colecciones de estudio

**Alcance:** MOB-034. La pantalla de detalle de una colección puede ofrecer **Compartir enlace** en las filas de recursos disponibles, junto a las acciones existentes.

La colección se carga con la autoridad autenticada y vigente del estudiante. Sólo se comparte cuando la API incluye la proyección legible del recurso y su UUID coincide con el ID miembro de la colección. Si la proyección es nula o no coincide, la fila conserva el estado de recurso no disponible y no muestra una acción de compartir. Compartir, abrir el detalle y quitar el recurso son acciones independientes.

El menú nativo recibe el título visible y `losapuntes:///resources/<uuid-v4>`. El enlace sólo localiza el recurso: al abrirlo, el detalle vuelve a cargarlo y la API comprueba sesión y acceso actuales. No se exponen URLs firmadas, tokens ni permisos. La bandera actual de colecciones sincronizadas sigue controlando la pantalla.

`apps/mobile/test/collection-resource-share-action.test.ts` comprueba la autoridad de la colección, el vínculo entre la proyección autorizada y el ID compartido, y la separación entre compartir, abrir y quitar.

La aceptación del menú nativo y navegación queda pendiente para iOS/Android con sesión activa y vencida, cancelación/completado del menú, vuelta desde detalle y lector de pantalla.
