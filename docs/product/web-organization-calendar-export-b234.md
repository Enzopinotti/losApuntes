# B234 — Guardar eventos de organizaciones en el calendario

El detalle Web de una organización permite descargar un evento vigente como archivo `.ics`, para abrirlo en el calendario elegido por la persona. La generación ocurre localmente en el navegador: no se envían detalles del evento a un servicio externo y no se necesita iniciar sesión.

La exportación incluye título, fecha y hora UTC, fin cuando existe, descripción, lugar y enlace público. Los campos de texto se escapan y las líneas se pliegan según el límite UTF-8 de iCalendar. Los eventos cancelados se identifican en pantalla y no ofrecen descarga. Datos incompletos o fechas inválidas no producen un archivo.

## Validación

- Contrato Web de Organizaciones.
- Pruebas de serialización iCalendar: fechas y zona horaria, caracteres de control, escape, líneas UTF-8, eventos cancelados e incompletos.
- Build/TypeScript y ESLint Web.
- Formato del monorepo, higiene y `git diff --check`.

Esta mejora no cambia los endpoints, el almacenamiento, los permisos de organización ni las notificaciones. La validación local no representa un resultado de los workflows automáticos de GitHub.

## Revisión de integración

Se rechaza un fin igual o anterior al inicio de origen. Para preservar eventos
válidos con fracciones de segundo, el fin se redondea hacia arriba a segundos;
el inicio mantiene la precisión truncada. Así un evento positivo subsegundo
conserva un DTEND posterior sin descartar el evento.
La regla de DTEND procede de RFC 5545, sección 3.8.2.2:
https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.2.2

Seis pruebas del serializador cubren UTC, escape, folding UTF-8, cancelación,
campos opcionales y los límites nuevos. La regresión de fin idéntico fallaba antes
de la corrección. Chromium descarga el archivo real generado por Blob, comprueba
nombre, contenido UTC y escape, y ausencia de exportación en cancelados.
API simulada; cero escrituras. Build Vite aprobado, despliegue unavailable.
Sin ejecutar ni reintentar CI.
