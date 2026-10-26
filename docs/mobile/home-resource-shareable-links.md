# Mobile Inicio: compartir recursos guardados y recientes

**Estado:** capacidad fuente, aún no aceptada en dispositivos. Relacionado con MOB-032 y MOB-FR-005, MOB-FR-007, MOB-FR-008 y MOB-FR-009.

## Recorrido

- En el preview de guardados de Inicio, compartir un recurso que se obtuvo bajo la autoridad de la sesión vigente.
- En el preview de abiertos recientemente, compartir sólo recursos cuyos IDs de sesión fueron reautorizados por la API antes de mostrarlos.
- Abrir `losapuntes:///resources/<uuid-v4>` para cargar el detalle actual y volver a verificar sesión y acceso. El enlace lleva un UUID, nunca una autorización.

Los recientes conservan únicamente IDs en memoria de proceso. Compartir no persiste esos recursos ni crea tracking, colas en segundo plano o grants. La acción requiere una interacción explícita y usa el menú nativo; si la sesión o el contexto cambian, la API vuelve a decidir el acceso.

## Cobertura

`apps/mobile/test/home-resource-share-action.test.ts` comprueba que Inicio conecta la acción con los guardados actuales y los recursos recientes reautorizados para la sesión.

La aceptación en dispositivos sigue pendiente: abrir con sesión activa y expirada, completar o cancelar el menú nativo, navegar al recurso y volver, reanudar desde background y comprobar accesibilidad.
