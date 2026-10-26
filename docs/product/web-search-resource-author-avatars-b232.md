# Avatares de autorías en Search y Recursos Web

Los resultados de recursos en Search y la biblioteca Recursos muestran el
avatar compacto al lado del autor cuando el servidor proyecta un perfil
público enlazable. Se reutiliza `PublicProfileAvatar`: solo carga URLs HTTPS
válidas, no acepta credenciales y mantiene la inicial si la imagen falla.

Si no hay identidad pública enlazable, la interfaz conserva la autoría textual
sin solicitar el avatar.

La validación contractual corre dentro de `pnpm test:web-resources-contract`.

## Revisión de integración

Chromium verifica Search y Recursos con autorías enlazables y sin perfil. Las
primeras muestran un avatar de 32 px dentro del enlace accesible; las segundas
conservan texto sin enlace ni petición de imagen, aunque el fixture incluya URL.
La prueba mantiene portapapeles explícito, aislamiento de URL privada y ciclos de
paginación de Recursos. API e imágenes se simulan localmente.

Contratos de Recursos/autoría y perfil público, TypeScript Web, ESLint, Prettier
y build Vite pasan. Metadatos de despliegue unavailable. Sin ejecutar ni reintentar CI.
