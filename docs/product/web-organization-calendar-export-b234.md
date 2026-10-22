# B234 — Guardar eventos de organizaciones en el calendario

El detalle Web de una organización permite descargar un evento vigente como archivo `.ics`, para abrirlo en el calendario elegido por la persona. La generación ocurre localmente en el navegador: no se envían detalles del evento a un servicio externo y no se necesita iniciar sesión.

La exportación incluye título, fecha y hora UTC, fin cuando existe, descripción, lugar y enlace público. Los campos de texto se escapan y las líneas se pliegan según el límite UTF-8 de iCalendar. Los eventos cancelados se identifican en pantalla y no ofrecen descarga. Datos incompletos o fechas inválidas no producen un archivo.

## Validación

- Contrato Web de Organizaciones.
- Pruebas de serialización iCalendar: fechas y zona horaria, caracteres de control, escape, líneas UTF-8, eventos cancelados e incompletos.
- Build/TypeScript y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

Esta mejora no cambia los endpoints, el almacenamiento, los permisos de organización ni las notificaciones. La validación local no representa un resultado de los workflows automáticos de GitHub.
