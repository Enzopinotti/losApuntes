# Compartir un recurso desde su detalle en Mobile (MOB-031)

## Problema y resultado

Mobile ya puede compartir el enlace nativo de un apunte desde Buscar, pero al
abrir su detalle sólo permite compartir la cita bibliográfica. Esta mejora
ofrece también **Compartir enlace** dentro de Acciones, para poder compartir el
recurso desde cualquier lugar que abra ese detalle.

La acción reutiliza `MobileResourceShareAction` y su constructor seguro. El
mensaje contiene el título mostrado y `losapuntes:///resources/<uuid-v4>`; el
detalle y el acceso se vuelven a consultar con la sesión actual al abrir el
enlace. El enlace es un localizador y no concede permisos ni cambia la
visibilidad del apunte.

## Límites de seguridad y UX

- Sólo se comparte después de que el detalle autorizado haya cargado.
- Sólo se aceptan identificadores UUIDv4 canónicos y títulos que pasan las
  validaciones compartidas con Search.
- El mensaje no incluye URL firmada, credencial, token, consulta, contexto
  académico, perfil ni concesión de acceso.
- La acción usa el menú nativo después de un toque, conserva el área accesible
  de 44 puntos e informa que el enlace no cambia el acceso.
- Un fallo al abrir el menú permite volver a intentarlo; cancelar el menú no
  se presenta como un fallo.
- No se implementa un dominio universal HTTPS ni se modifica la autoridad del
  backend.

## Criterios de aceptación

1. Con un recurso accesible y UUIDv4 canónico, Detalle muestra **Compartir
   enlace** en la sección Acciones.
2. El menú nativo recibe sólo el título validado y la ruta `losapuntes:///resources/<uuid-v4>`.
3. Un ID o título rechazado por el constructor seguro no muestra el botón.
4. Al abrir el enlace, Detalle solicita el recurso con la sesión actual; el
   enlace no permite eludir la visibilidad o las autorizaciones existentes.
5. No se comparte URL firmada, archivo, consulta, contexto o token. La cita
   bibliográfica continúa siendo una acción separada.
6. La acción tiene nombre accesible, explica que el enlace no concede acceso y
   permite reintentar si el menú nativo falla.

## Trazabilidad y validación

Continuidad de `MOB-016`, `MOB-FR-001`, `MOB-FR-005`, `MOB-FR-007`,
`MOB-FR-009` y `RES-FR-005..010`. La implementación y el test de cableado
verifican la reutilización del constructor y de la acción de Search. La
validación local cubre suite Mobile, TypeScript, formato, higiene, `git diff
--check` y exportaciones Expo iOS/Android. La aceptación real del menú nativo
en dispositivos permanece pendiente.
