# Compartir recursos de Inicio en Mobile (MOB-032)

## Problema y resultado

Inicio ofrece una vista breve de los apuntes guardados por la persona y de los
apuntes que abrió durante la sesión actual. Para compartirlos hoy hay que abrir
cada detalle o volver a Buscar. Esta mejora agrega **Compartir enlace** junto a
cada recurso disponible en ambas vistas.

La acción reutiliza el constructor y el menú nativo de enlaces de recursos. El
mensaje contiene únicamente el título visible y
`losapuntes:///resources/<uuid-v4>`. Los elementos guardados proceden de la
consulta autenticada actual; los recientes se vuelven a cargar bajo la sesión
actual antes de mostrarse. El enlace no concede acceso; el destinatario abre el
detalle, que solicita el recurso de nuevo y deja que la API aplique las reglas
vigentes.

## Límites de seguridad y UX

- No se agrega una fuente nueva ni se comparte un ID tipeado por la persona.
- El preview de guardados conserva la autoridad de sesión ya aplicada por su
  controlador. La vista de recientes comparte sólo recursos que el controlador
  pudo reautorizar para esa sesión.
- La lista de recientes conserva sólo identificadores en memoria de proceso y
  sesión; esta mejora no los escribe en almacenamiento persistente.
- Se reutiliza la allowlist UUIDv4, la validación del título y el botón nativo
  accesible de 44 puntos. Un ID inválido no ofrece la acción.
- El mensaje excluye URL firmada, archivo, sesión, token, grants, consulta y
  contexto académico. Compartir no cambia visibilidad ni permisos.
- La acción requiere un toque. Cancelar el menú nativo no produce un error; si
  el menú falla, se puede reintentar.

## Criterios de aceptación

1. Cada recurso disponible en el preview autenticado de guardados ofrece
   **Compartir enlace**.
2. Cada recurso reciente que pudo reautorizarse bajo la sesión actual ofrece
   **Compartir enlace**; recursos revocados o no disponibles no aparecen como
   elementos compartibles.
3. El menú nativo recibe sólo título y `losapuntes:///resources/<uuid-v4>`.
4. Un destinatario sin acceso vigente no obtiene acceso al abrir el enlace; el
   backend vuelve a autorizar el detalle.
5. La acción es accesible, explica que el enlace no concede acceso y permite
   reintentar un fallo del menú.
6. No se amplía el almacenamiento de recientes ni se genera una URL pública o
   universal HTTPS.

## Trazabilidad y validación

Continuidad de `MOB-016`, `MOB-FR-001`, `MOB-FR-005`, `MOB-FR-007`,
`MOB-FR-009` y `RES-FR-005..010`. Tests focales de Home verifican la conexión
con el preview de guardados y con los detalles recientes reautorizados. La
validación local cubre suite Mobile, TypeScript, formato, higiene,
`git diff --check` y exportaciones Expo iOS/Android. La aceptación del menú
nativo en dispositivos permanece pendiente.
