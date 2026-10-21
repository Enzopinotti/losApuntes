# B169 — Modo Enfoque en la mesa de estudio

**Fecha:** 21 de octubre de 2026. **Base:** main@6bd965c71f6426da3d49fc7c0555e0e5afda06a9.  
**Alcance:** mejora privada de UX Web, sin APIs, nuevas colecciones de base de datos, actualizaciones de permisos o alteraciones del build Mobile.

## Propósito

El estudiante que selecciona una materia en la mesa de estudio puede elegir un intervalo **voluntario y finito** de 25 minutos para estudiar o 5 minutos para descansar. El reloj evita métricas de uso, rachas, presión por permanencia, autoplay y tracking. No expone datos del usuario ni almacena títulos, materias o timestamps.

## Flujo de usuario

1. Ingresar autenticado a /study y seleccionar una materia realmente admitida en el contexto del backend.
2. La sección «Tiempo para concentrarte» aparece solo mientras la materia esté disponible y autorizada. Por defecto dice «Estudiar · 25 min» y muestra 25:00 con fase «Listo para empezar». El usuario debe pulsar **Iniciar**.
3. Mientras está en marcha, puede pausar y reanudar. **Reanudar no inicia otros 25 minutos**. El contador toma la diferencia con un deadline, no cuenta ticks, por lo que se actualiza tras throttling de pestaña, al volver a enfocarla o al reabrir la ventana.
4. Puede cambiar a «Descansar · 5 min» una vez detenido y reiniciar voluntariamente. Cambiar modo descarta el intervalo anterior; no hay autotransición ni alerta sonora.
5. Al agotarse el tiempo la fase termina y aparece un mensaje sin popup, notificación del navegador, permisos o sonidos. Solo una acción explícita puede reiniciar.
6. Al cambiar materia, cuenta, sesión o salir de la ruta el componente se desmonta y borra todos los datos efímeros. No guarda historial, tokens, tiempos ni estadísticas en storage.

## Invariantes técnicos

- «Un reloj por sesión/materia activa»: React remonta la vista usando una clave de authScope y selectedSubject.id que nunca se envía al helper del temporizador; la autorización continúa a cargo del servidor y del PrivateRoute preexistentes.
- «Duración por deadline»: tick usa Date.now() únicamente para derivar el tiempo restante, sin dependencia de cuánto tarda setInterval. Un retroceso del reloj nunca incrementa los minutos ya descontados. Al suspender, el estado paused congela el restante y cancela el deadline.
- «Sin persistencia y sin efectos sobre el dominio»: no localStorage, sessionStorage, red, servicios HTTP, cookies, Push, correo ni datos analíticos. No confundirlo con Study Progress o Study Session, que poseen contratos/versiones propios.
- «Accesibilidad»: botones nativos, aria-pressed, role=group y controles de 44 px, foco visible, pantalla de estado amable al finalizar sin anunciar cada segundo (aria-live=off sobre el reloj), responsive y respeto por preferencias de movimiento reducido.

## Validación de aceptación

- tests deterministas del helper: estado inicial, inicio explícito, pausa, reanudación, throttle/background, tiempo terminal, retroceso de reloj, formato, duraciones inválidas y no persistencia.
- Playwright Chromium sobre Vite/loopback con sesión y contexto académico simulados: avanzar reloj virtual, pausar, completar, elegir descanso, cambiar materia (sin rescatar estado previo), cerrar sesión y confirmar que PrivateRoute retira el temporizador.
- Node24, pnpm 9.15.9 frozen, TS, ESLint, Prettier, build Web y test incorporado a pnpm check del repositorio.
- El resultado del PR debe distinguir focused CI, global Quality Gate y auditoría de supply-chain, con evidencia del HEAD exacto.

## Límites / seguridad y release

No constituye una medalla de uso, un registro académico, una garantía de recuperación ante cierre de pestaña ni un modo Pomodoro persistente. Un cambio de hora del sistema puede retrasar la finalización si el usuario modifica deliberadamente el reloj, por lo que esta es una ayuda visual, no un cronómetro certificado.

Los GHSA de node-forge (#133) y braces (#141) todavía no tienen una versión upstream revisada y publicada confirmada. B164 PR #495 resuelve de forma independiente los dos HIGH nuevos de follow-redirects, pero sigue Draft. No se modifica ninguna excepción ni se fusiona/despliega mientras Production dependency audit sea roja y el issue de release #353 permanezca HOLD.
