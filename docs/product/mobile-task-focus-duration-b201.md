# B201 — Temporizador con duración sugerida por la tarea

## Qué cambia

Cada próximo paso de estudio en la Agenda puede abrir el temporizador con los
minutos asignados a esa tarea. El temporizador muestra la duración sugerida en
la pantalla de inicio y espera que la persona lo inicie manualmente.

## Límites

- Acepta sólo duraciones enteras de 5 a 120 minutos, en incrementos de cinco.
  Parámetros malformados o fuera de rango vuelven al intervalo habitual de 25
  minutos.
- No empieza automáticamente, no crea recordatorios y no sincroniza ni registra
  tiempo. Salir de la pantalla mantiene el descarte de la sesión del reloj.
- Los intervalos de descanso siguen siendo de cinco minutos.
- La duración proviene del plan privado del usuario y se pasa como un número
  acotado de minutos; no se adjuntan títulos, IDs ni contenido a la ruta.

## Validación

- No agrega endpoints, persistencia, permisos, dependencias ni cambios de
  workflows.
- Este bloque se apila sobre B200 (#610), que aporta la bandeja de próximas
  tareas y la duración guardada por tarea.
- La aceptación local y los commits exactos se documentan en su PR.
