# B224 — ordenar secciones del perfil

## Problema

El perfil público ya respeta el orden que devuelve la API, pero el dueño no podía elegir ese orden en “Mi perfil”.

## Comportamiento

- “Mi perfil” lista todas las secciones del contrato y ofrece botones accesibles para subirlas o bajarlas.
- Los controles no permiten sacar secciones ni duplicarlas, de modo que el servidor recibe siempre el orden completo requerido.
- Guardar envía el orden junto con los presets y la revisión optimista del perfil.
- La explicación aclara que el orden no modifica la privacidad de ninguna sección.

## Aceptación

- Los límites desactivan “Subir” para la primera sección y “Bajar” para la última.
- Cambiar el orden conserva todos los elementos exactamente una vez.
- Recargar restaura el orden guardado por el servidor.
