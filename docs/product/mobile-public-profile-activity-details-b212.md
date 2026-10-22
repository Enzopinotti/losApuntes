# B212 — detalle legible de actividad pública en Mobile

## Problema

La actividad del perfil público sólo mostraba el título. El API ya proyecta tipo, descripción y fechas de cada actividad, pero Mobile omitía ese contexto.

## Comportamiento

- Cada actividad muestra título, tipo traducido, descripción disponible y rango de fechas sin conversión de zona horaria.
- Fechas parciales se presentan como “Desde” o “Hasta”; si no existen fechas, se omite la línea.
- La paginación y los estados de carga, error y reintento de B210 se conservan.

## Alcance

Usa únicamente campos que el servidor ya incluye en la sección de actividad pública autorizada. No convierte URLs de perfil en navegación ni agrega rutas, permisos o almacenamiento.

## Aceptación

- Los cinco tipos de actividad tienen etiquetas legibles en español.
- Rangos completos, fechas parciales y fechas ausentes se muestran sin reinterpretar fechas civiles como instantes.
- La descripción permanece como texto; no se interpreta como HTML ni como destino de navegación.
