# Mobile Search — enlaces nativos y continuidad de consultas

**Estado:** capacidad fuente, aún no aceptada en dispositivos. Requisitos relacionados: MOB-FR-005, MOB-FR-007, MOB-FR-008, MOB-FR-009, SEARCH-FR-001..007.

## Recorrido del estudiante

- Buscar por texto y categoría en Mobile o filtrar la búsqueda de Recursos por una materia.
- Tocar **Compartir búsqueda** para abrir el menú nativo del sistema. Sólo se comparte una URL de Los Apuntes con el texto de búsqueda (2 a 120 caracteres), el alcance público y un UUID canónico de materia cuando corresponde. No se comparten nombre privado de materia, sesión, perfil, resultado descargado ni autorización.
- Abrir el enlace `losapuntes:///search?q=parcial&scope=resources&subjectId=<uuid-v4>` en una instalación de la app; Mobile valida todos los campos y restaura el texto, categoría y materia **en una sola transición**. El controlador de Search efectúa una nueva consulta a la API autenticada vigente y filtra respuestas antiguas.
- Seguir abriendo enlaces antiguos de la forma `losapuntes:///search?subjectId=<uuid-v4>` para explorar una materia sin texto.
- Desde cada apunte visible en resultados de Buscar o descubrimiento contextual, tocar **Compartir enlace** para enviar su título y `losapuntes:///resources/<uuid-v4>` por el menú nativo. Al abrirlo, la ruta de detalle obtiene datos actuales y vuelve a verificar la sesión y el acceso del destinatario.
- En Inicio, compartir desde los previews de **guardados** y **abiertos recientemente** sólo los recursos que se cargaron bajo la sesión vigente. Los recientes conservan únicamente IDs en memoria de proceso; compartir no los persiste.
- Si el enlace es inválido, mostrar un aviso accesible sin ejecutar silenciosamente una búsqueda global fuera del contexto requerido. El usuario puede elegir otra búsqueda manualmente.
- Si la sesión caduca, no se presenta como una autorización heredada del enlace. La API y el Academic Graph vuelven a decidir visibilidad y acceso.

## Alcance y límites

El scheme `losapuntes` es el configurado en `apps/mobile/app.json`. **No se declara soporte universal/associated-domain HTTPS** porque no hay dominios verificados configurados ni evidencia de iOS/Android en dispositivos. Los enlaces a la app requieren instalación capaz de reconocer el scheme. No se promete que el enlace sea utilizable desde todas las apps de mensajería o sitios.

El enlace directo a un recurso contiene únicamente su UUIDv4 y nunca es una capacidad de acceso. La API vuelve a decidir qué puede leer el destinatario al abrir el detalle. No compartir URLs firmadas, tokens o grants; la acción móvil solo usa el scheme de la app.

El destinatario puede ver el término consultado en el enlace. No compartir búsquedas que contengan datos sensibles. El menú de compartir requiere acción del usuario y no se utiliza almacenamiento persistente, tracking ni cola en segundo plano.

La búsqueda nativa autenticada no equivale a la búsqueda anónima Web. Los endpoints mantienen las autorizaciones existentes; el enlace no añade permisos.

## Seguridad

- Texto trim, longitud 2–120, sin controles; UUID v4, scopes conocidos y combinaciones sujetas a autorización.
- Un `subjectId` sólo combina con `scope=resources`. Para compatibilidad, `subjectId` sin scope se interpreta como Resources.
- Parámetros duplicados de los tres campos esenciales se rechazan, y no se comparten parámetros extra.
- El estado del enlace se aplica sólo cuando la sesión y el contexto académico ya son autoritativos, la vista tiene foco y la app está en foreground.
- El controller cancela búsquedas anteriores al recuperar el enlace; los cambios de cuenta/contexto siguen invalidando solicitudes pendientes.
- Los deep links de Auth de `+native-intent.tsx` no se reemplazan ni se mezclan con URLs de búsqueda.

## Pruebas y aceptación futura

`apps/mobile/test/search-deep-link.test.ts` prueba parser, roundtrip del esquema, unicode/caracteres reservados, inputs inválidos, compatibilidad de enlaces por materia, privacidad y sustitución atómica de filtros.

`apps/mobile/test/resource-share-link.test.ts` prueba la ruta de recurso con UUIDv4, el payload y el rechazo de parámetros o metadatos inseguros.
`apps/mobile/test/home-resource-share-action.test.ts` verifica que Inicio conecte la acción con los guardados actuales y con los recursos recientes reautorizados.

**Pruebas de código CI**: typecheck, lint, test Mobile y contratos de Search. **Pendiente para aceptación final**: abrir enlace recibido en iOS/Android con sesión activa y expirada; share sheet cancelado/completado; navegación hacia recurso y vuelta; resumption desde background; lector de pantalla; y caducidad/rotación de contexto. No se iniciará la aplicación ni se afirmará aceptación de dispositivo hasta que se acuerde la fase de pruebas.
