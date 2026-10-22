# Mobile B206 — filtros de estado en preguntas por materia

El feed móvil de una materia permite ver todas las preguntas, solo las abiertas o solo las cerradas. Mobile envía el filtro al endpoint existente `GET /questions`; el servidor valida el estado y aplica las reglas canónicas de visibilidad antes de devolver cada página.

El estado queda incluido en la autoridad de la pantalla y se conserva al cargar páginas siguientes. Cambiarlo cancela la carga previa y empieza un recorrido nuevo, así los cursores no se mezclan entre filtros. “Cerrada” describe el estado actual de la pregunta y no garantiza que una respuesta haya sido aceptada.

B206 no agrega endpoints, permisos, almacenamiento, dependencias ni cambios a workflows. La validación local cubre la query HTTP y la persistencia del filtro durante la paginación.
