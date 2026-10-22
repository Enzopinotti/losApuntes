# Avatares en autorías de la comunidad Mobile

Las preguntas del feed, los detalles de preguntas, sus respuestas y los autores
públicos de recursos en Search muestran el avatar junto a la autoría enlazable.
Se reutiliza `NetworkPersonAvatar`, que limita la carga a URLs HTTPS seguras y
mantiene la inicial si falta la imagen o falla la petición.

Cuando el servidor no ofrece una acción hacia un perfil público, se conserva la
atribución textual existente sin intentar cargar un avatar.

La prueba de presentación de estas autorías corre dentro de
`pnpm --filter @losapuntes/mobile test`.
