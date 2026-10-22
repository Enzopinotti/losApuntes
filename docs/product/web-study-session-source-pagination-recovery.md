# Recuperación de fuentes paginadas en la sesión de estudio

El planificador de sesión carga tres listas independientes para la materia
activa: apuntes guardados, apuntes disponibles y preguntas. Cada fuente mantiene
su propio historial de cursores dentro de la sesión y materia actuales.

Si una página repite su cursor solicitado o uno ya recorrido, la lista deduplica
la página recibida, detiene solo su propia cadena y ofrece actualizar esa
fuente desde la primera página. Los fallos transitorios conservan los resultados
y el cursor para reintentar; errores de sesión vencida o contenido no disponible
limpian la fuente afectada. “Actualizar fuentes” reinicia las tres cadenas de
forma independiente.

El buscador de material del planificador y la pantalla de estudio portable
mantienen sus propios ámbitos y cursores; este documento cubre las tres listas
de la sesión de estudio.

Regresión: `pnpm test:web-study-session-source-cursors`.
