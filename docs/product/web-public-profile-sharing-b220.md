# B220 — compartir perfiles públicos en Web

## Problema

Web permite visitar un perfil público por su ruta canónica, pero no ofrece una acción para compartirlo.

## Comportamiento

- El botón genera un enlace `/p/:profileId` a partir del identificador canónico que devuelve el servidor.
- Solo aparece cuando el servidor proyecta un nombre público para el perfil.
- Usa Web Share API cuando está disponible; si falla o no existe, copia el enlace al portapapeles.
- Si tampoco se puede copiar, presenta el enlace en un campo seleccionable y anuncia el problema.
- Cancelar el diálogo nativo no se presenta como error.

## Alcance

El enlace conserva el origen actual de la aplicación y no acepta esquemas, credenciales ni identificadores de perfil arbitrarios.

## Aceptación

- Solo UUIDv4 canónicos producen enlaces.
- La acción sigue funcionando con portapapeles como alternativa al diálogo nativo.
- El resultado se anuncia con estado accesible y el encabezado social existente permanece disponible.
