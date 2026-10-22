# Avatares seguros en el feed Web

Las tarjetas del feed reutilizan `PublicProfileAvatar` para mostrar autores
personales y organizaciones. El feed mantiene el tamaño de 44 px y su color de
respaldo; la política común solo carga HTTPS válido, oculta imágenes fallidas y
conserva la inicial.

La verificación contractual corre dentro de `pnpm test:web-feeds-contract`.
