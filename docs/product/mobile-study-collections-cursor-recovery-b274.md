# B274 — Recuperación de cursores en Colecciones Mobile

## Problema

La vista Mobile de Colecciones sincronizadas pagina por separado el listado de colecciones y los apuntes dentro de una colección. Un cursor repetido o un ciclo podía volver a mostrar la acción de cargar más sin avanzar.

## Comportamiento

- El listado y el detalle mantienen historiales independientes de cursores completados.
- Una respuesta que repite el cursor solicitado o vuelve a una página anterior no reemplaza el contenido visible; detiene esa tanda y deja disponible la actualización de la superficie.
- Las páginas con error no consumen su cursor, así que los fallos transitorios siguen siendo reintentables.
- Abrir o actualizar el listado y seleccionar o actualizar una colección reinicia el historial correspondiente.

El cambio no habilita la función ni modifica el flag, los contratos de API, la autoridad de lectura o la persistencia.

## Evidencia local

- Pruebas focalizadas para autorrepetición, ciclos y aislamiento entre lista y detalle.
- TypeScript de Mobile, Prettier y `git diff --check`.
