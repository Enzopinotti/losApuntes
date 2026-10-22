# Avatares de autorías en Search y Recursos Web

Los resultados de recursos en Search y la biblioteca Recursos muestran el
avatar compacto al lado del autor cuando el servidor proyecta un perfil
público enlazable. Se reutiliza `PublicProfileAvatar`: solo carga URLs HTTPS
válidas, no acepta credenciales y mantiene la inicial si la imagen falla.

Si no hay identidad pública enlazable, la interfaz conserva la autoría textual
sin solicitar el avatar.

La validación contractual corre dentro de `pnpm test:web-resources-contract`.
