# B135 — Organizar próximos repasos y registrar intentos (privado, en pestaña)

**Base verificada:** `main@4c18cdd9c4f0123d4fb85369e3f59720b40ffad1` (B134).
**Entrega:** flujo de Study Practice, sin nuevos endpoints ni cambios de formato de exportación.
**Seguridad / release:** #353 **HOLD**, `STUDY_PROGRESS_ENABLED=false`; #133 y #141 no están remediados.

## Qué cambia para el estudiante

Después de clasificar preguntas como **Necesito repasar**, puede:

- Elegir opcionalmente **fecha y hora locales** del próximo repaso (hasta 180 días en el futuro) y el tiempo por pregunta: **15, 20, 30 o 45 minutos**.
- **Pasar las preguntas al Planificador** mediante el handoff efímero, autorizado y vinculado a sesión/materia existente. El plan de sesión v1 lleva su fecha y duración elegidas.
- **Descargar el JSON v1** con exactamente los mismos datos de planificación, sin añadir otro formato incompatible ni cachear contenido de terceros.
- Ver un **historial acotado de hasta 8 intentos anteriores** dentro de la ronda abierta. Solo incluye números: revisadas para repasar, explicadas y sin clasificar. No registra respuestas, preguntas ni fechas individuales.
- Repetir las preguntas elegidas con B134; el historial representa el estado elegido explícitamente en la ronda anterior, no una calificación o medición de aprendizaje.

## Autoridad, privacidad y límites

- El selector solo planifica preguntas que el estudiante **marcó explícitamente para repasar**; el modelo reutiliza el `recallToStudySession` ya existente.
- `organizeRecallSession` valida estrictamente que sean preguntas v1 pendientes de longitud acotada, duración perteneciente a la lista permitida, fecha/hora local válida y un horario **posterior a ahora + 1 minuto** y no más allá de **180 días**.
- El proceso **no** agenda notificaciones, eventos en calendarios ni trabajos futuros. El usuario debe cargar el plan desde el Planificador o su JSON y hacer la revalidación normal.
- `recordRecallAttempt` valida identificadores y marcas, no acepta outcomes de preguntas ajenas, calcula solo totales y limita la memoria a ocho entradas. Cambiar cuenta, sesión o materia invalida la vista mediante `scope`; salir de la ronda elimina el historial.
- La app no envía los intentos ni sus respuestas a servicios externos; tampoco utiliza `localStorage`, `sessionStorage`, `IndexedDB` ni persistencia de backend para estos registros.
- El `detailKey` por intento, el refresh de preguntas y el `AsyncAuthorityFence` de B134 siguen intactos; ningún identificador de pregunta es una autorización.

## Pruebas y aceptación

```sh
pnpm test:web-study-recall-planning
pnpm test:web-study-retry-round
node scripts/test-web-study-active-recall.mjs
node scripts/test-web-study-practice-integration.mjs
node scripts/test-web-focused-practice-contract.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web format:check
```

El test B135 también participa del `pnpm test` global y un workflow read-only lo ejecuta sobre el **HEAD exacto** del PR. El Quality Gate global, coberturas críticas, smoke de contenedores y audit productivo siguen siendo independientes.

## Fuera de alcance deliberadamente

No hay sincronización multidispositivo, recordatorios automáticos, métricas académicas, calendario remoto ni habilitación de Study Progress. Para afirmaciones de release GO hace falta cerrar #353 con evidencia real de seguridad, navegador/dispositivos y restauración. La integración de este bloque a `main` **no** resuelve el audit productivo ni aprueba un despliegue.
