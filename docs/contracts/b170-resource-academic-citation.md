# B170 — Referencias académicas de apuntes (Web)

Fecha: 21 de octubre de 2026. Base: main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9.

## Alcance funcional

Los recursos autorizados muestran títulos, materias, visibilidad y atribución visible de autor. B170 suma una **referencia sencilla y revisable antes de copiarla**, sin afirmar conformidad con APA/MLA o verificar autorías inexistentes.

- El estudiante pulsa **Preparar referencia** en un recurso visible. No se hace copia automática ni petición extra al servidor.
- La referencia usa únicamente título, nombre de materia y autor visible. Si el nombre de autor falta, aparece «Autoría no indicada». La fecha es «(s. f.)» (sin fecha); no se deriva de timestamps técnicos.
- Solo si la visibilidad vigente en el recurso recibido es **public**, se incluye un enlace absoluto del mismo origen a /resources/:resourceId. El enlace no transmite tokens, grants, query ni hash, y no reemplaza la verificación de permisos al abrirlo.
- Los recursos **private** y **shared** mantienen la atribución, pero **no incluyen enlace**, incluso cuando el usuario tiene acceso a su contenido. Se explica expresamente que copiar una referencia no concede acceso.
- Los metadatos se normalizan eliminando controles, escapes bidireccionales y saltos de línea. Datos vacíos, tipos incorrectos, campos demasiado extensos o IDs no UUIDv4 se rechazan sin inventar texto.
- El estudiante revisa el texto en un textarea de solo lectura. El botón **Copiar referencia** usa el portapapeles del navegador tras un clic. Ante error, el campo permanece seleccionable manualmente.
- La clave React del componente incluye sesión, usuario, recurso, visibilidad y título, evitando mantener confirmaciones de copia a través de esos cambios.

## Contrato de calidad

- 10 pruebas deterministas sobre enlaces públicos y no públicos, autor ausente, ausencia de fecha, caracteres bidi, origin URLs hostiles, IDs malformados, visibilidad desconocida, copia explícita y ausencia de persistencia.
- Prueba real Chromium sobre Vite en loopback: recurso público para invitado con portapapeles opt-in; recurso privado con sesión autenticada y texto sin URL/ID; invitado rechazado para el recurso privado; cero HTTP mutaciones realizadas por el flujo.
- Workflow B170 con Node 24, pnpm 9.15.9, instalación congelada, TypeScript, ESLint, Prettier, Chromium y build Web con SHA exacto.
- El contrato determinista se integra al test general del monorepo, pero el merge y la release siguen sujetos a todos los checks globales.

## Límites

Esto no crea bibliografía APA validada ni acredita autoría legal, fechas editoriales o accesibilidad futura del enlace. No agrega endpoints, permisos, lecturas automáticas, cookies, analytics, descargas ni guardado local. La copia manual de un título privado depende de una acción consciente del usuario autorizado.

El release issue #353 sigue HOLD. La corrección upstream de follow-redirects se encuentra en PR #495 Draft; las HIGH de node-forge #133 y braces #141 siguen pendientes. No se cambian excepciones de auditoría ni se integra/despliega con la auditoría global fallida.
