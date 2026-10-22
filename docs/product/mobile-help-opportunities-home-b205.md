# Mobile B205 — preguntas donde ayudar

La pantalla Inicio muestra hasta tres materias actuales con preguntas abiertas de compañeros que todavía no tienen respuestas visibles. La selección proviene de `GET /qa/me/help-opportunities`, que deriva la cuenta de la sesión y entrega hasta doce materias actuales. El cliente resuelve sus nombres con `GET /academic/me/subjects`, también autenticado para la misma sesión.

La interfaz descarta el bloque completo si una oportunidad no corresponde a una materia actual del dueño o si las respuestas no se pueden validar. Solo muestra el nombre canónico de la materia y un conteo. No presenta preguntas, cuerpos, autores, respuestas ni señales personales. Cada fila abre el carril canónico de preguntas que necesitan ayuda, que vuelve a comprobar la visibilidad.

El resumen se vuelve a consultar al regresar a Inicio y cancela solicitudes al perder autoridad, foco o primer plano. Si el servidor informa más de doce materias, la interfaz aclara el límite y no afirma que las demás estén vacías. Una respuesta sin preguntas describe únicamente el alcance que el servidor pudo revisar.

B205 no agrega endpoints, permisos, almacenamiento, dependencias ni cambios a workflows. La aceptación local cubre el parser owner-scoped, el uso de credenciales de sesión, el cerco ante cambio de sesión y la carga de Inicio.
