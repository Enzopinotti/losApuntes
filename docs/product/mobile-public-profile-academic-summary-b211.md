# B211 — resumen académico en perfiles públicos de Mobile

## Problema

El servidor ya incluía una sección académica pública cuando la privacidad del perfil la habilitaba, pero Mobile no la mostraba. Web sí indicaba cuántas afiliaciones y materias formaban parte de la proyección.

## Comportamiento

- Mobile muestra “Trayectoria académica” sólo cuando el servidor incluye la proyección académica.
- Presenta los conteos de afiliaciones académicas publicadas y materias asociadas, con singular/plural correcto.
- No proyecta filas, contexto actual ni datos de afiliación o materia; el cliente usa los conteos de la sección autorizada por el servidor.

## Alcance

La sección reutiliza `academic` de `GET /profiles/:profileId`. No agrega llamadas, contratos, campos locales ni cambios de privacidad.

## Aceptación

- Una proyección omitida no genera contenido ni implica que la cuenta carezca de trayectoria.
- Los conteos en singular, plural y cero son correctos.
- Ningún dato de las filas académicas o del contexto actual se copia al texto del perfil.
