# B223 — edición de apariencia del perfil

## Problema

La API y el perfil público ya admiten presets de acento y portada, pero la persona no podía elegirlos desde “Mi perfil”.

## Comportamiento

- “Mi perfil” permite elegir uno de los seis acentos y una de las cuatro portadas admitidas por la API.
- Los valores se cargan desde el perfil guardado y se envían junto con la actualización existente.
- El formulario aclara que la apariencia no cambia la privacidad; los campos siguen validados por el servidor.

## Aceptación

- Recargar conserva la selección devuelta por el servidor.
- Guardar envía los presets dentro de `presentation` junto con la revisión optimista existente.
- Opciones accesibles muestran nombres localizados y solo valores admitidos.
