# B226 — edición de actividades del perfil Web

## Problema

La API permitía editar actividades propias con control de revisión, pero Web solo permitía agregarlas y eliminarlas.

## Comportamiento

- Cada actividad puede editar tipo, título, descripción, URL HTTPS y período.
- El cliente envía la revisión observada; si otra pestaña la cambió, explica el conflicto sin sobrescribirla.
- Crear actividades también acepta un enlace HTTPS opcional.
- Tras guardar, la interfaz vuelve a cargar la actividad confirmada por el servidor.
- El perfil privado solo abre enlaces que pasan la política HTTPS sin credenciales.

## Aceptación

- Editar y quitar un enlace se guardan a través del endpoint de actualización existente.
- Los límites y fechas siguen validados por el servidor.
- El conflicto de revisión se distingue del conflicto de edición general del perfil.
