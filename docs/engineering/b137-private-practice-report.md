# B137 — Informe personal descargable de práctica, sin contenido de terceros

**Base dependiente:** `B136@c5dca03f22f414ff1f8aa1a540d4d4f6d70cffab`. La rama B137 se apila sobre B136; **no corresponde integrarla en `main` hasta que el PR #460 pase sus gates y sea fusionado.**

## Funcionalidad

En `StudyPractice`, durante una ronda activa, el estudiante puede pulsar **Descargar resumen privado** y obtener un archivo Markdown con:

- Los recuentos de cada intento anterior y el actual (hasta ocho antecedentes y un intento vigente): explicadas, marcadas para repasar y sin clasificar.
- Minutos elegidos por pregunta para el próximo repaso.
- Tiempo total estimado de repaso, calculado solo sobre las preguntas explícitamente marcadas «Necesito repasar».
- Una aclaración explícita de que el archivo no es una nota, aprobación ni medición acreditada del aprendizaje.

No se incluyen UUID de materias o preguntas, autores, títulos ni respuestas comunitarias; tampoco reflexiones privadas, permisos, tokens, correo, nombre, fecha ni URL. El reporte está construido exclusivamente a partir de cinco números por intento y la duración escogida, con **formato textual estático** y sin interpolación de texto aportado por usuarios externos.

## Privacidad y seguridad

- La descarga **solo se ejecuta mediante el botón**, desde el navegador autenticado y cuando existe una ronda vigente. No hay exportación automática ni nueva ruta/API.
- `buildPrivateRecallReport` rechaza objetos con campos desconocidos, estructuras malformadas, fracciones, overflow, valores negativos, número de intentos excesivo, IDs agregados accidentalmente y tiempos fuera de la lista de B135.
- El historial debe estar ordenado por número de intento, con continuidad estricta entre el último histórico y el actual. La cantidad de preguntas del intento actual debe coincidir con las que el intento anterior marcó para repasar: impide exportar un recuento inconsistente que podría dar una falsa sensación de progreso.
- La descarga no modifica el estado actual de la práctica, no borra respuestas ni pausa la ronda y no escribe `localStorage`, `sessionStorage`, `IndexedDB` ni backend. El archivo local es propiedad del estudiante, por lo que se explica claramente su naturaleza personal.
- Se usa un objeto Blob de texto Markdown con URL revocada, igual que la descarga de planes JSON existente.

## Comprobaciones exigidas

```bash
pnpm test:web-study-private-report
pnpm test:web-study-recall-pause
pnpm test:web-study-recall-planning
pnpm test:web-study-retry-round
node scripts/test-web-study-practice-integration.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

La nueva prueba forma parte de `pnpm test` y un workflow específico corre con el SHA exacto de B137 en modo de solo lectura. Debe probarse el PDF/Markdown descargado con lectores de pantalla y la interacción en navegador antes de afirmar aceptación release.

## Release

Sin cambios en flags, BD, seguridad, dependencias, API o permisos. El release **#353 sigue en HOLD**, `STUDY_PROGRESS_ENABLED=false` y #133/#141 mantienen sus advisories no remediados. Un PR verde de esta funcionalidad no reemplaza el audit ni habilita producción.
