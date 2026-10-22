# B219 — orden de secciones en perfiles públicos Mobile

## Problema

La proyección pública devuelve `presentation.sectionOrder`, pero Mobile agrupaba todos los datos en una tarjeta con orden fijo.

## Comportamiento

- Mantiene identidad y biografía en la primera tarjeta.
- Ordena las tarjetas de proyección profesional, trayectoria académica, aprendizaje, habilidades y actividad pública según el servidor.
- Omite secciones no proyectadas y evita tarjetas duplicadas.
- Conserva las acciones sociales después del contenido público.

## Alcance

El orden procede de `profile.presentation.sectionOrder`. La pantalla crea tarjetas únicamente para datos presentes en `profile`; no consulta ni infiere secciones privadas.

## Aceptación

- La secuencia de tarjetas sigue el orden público recibido.
- Secciones no disponibles o repetidas no crean contenido.
- La identidad y la biografía siguen arriba, y las acciones sociales no cambian.
