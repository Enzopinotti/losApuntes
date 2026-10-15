# B43 — Continuidad directa entre Práctica y Planificador

**Scope:** Los Apuntes 2026 Web. Base B40 Mesa, B41 Planificador, B42 Práctica.  
**Estado:** bloque integrado al código solo tras merge; no se presume validación de navegador/CI.

## Problema y solución

La ronda de práctica permitía exportar preguntas pendientes como JSON y luego importarlas manualmente en el Planificador. Se conserva esa portabilidad, pero se suma una opción de un clic **"Pasar pendientes al Planificador"** que no descarga ni guarda archivos.

La página de práctica utiliza `recallToStudySession` para crear un `StudySession` v1 limitado a preguntas marcadas **"Necesito repasar"**. Las notas del intento de respuesta jamás forman parte del traslado. Si existen intentos escritos, la pantalla confirma explícitamente que se perderán al navegar.

## Transferencia temporal y alcance de autoridad

- `study-session-handoff.mjs` mantiene un `Map` **en memoria del módulo JavaScript**, no en backend/DB, localStorage, sessionStorage ni cookies.
- Al salir de Práctica, se crea un nonce UUIDv4, opaco, sin títulos, respuestas ni IDs de preguntas expuestos en `location.state`. La URL solo contiene el Subject ID ya utilizado por la Mesa.
- Cada nonce se vincula al ámbito de autenticación **status + user.id + session.id + Subject ID**, con caducidad de **10 minutos** y máximo cinco pases simultáneos por pestaña.
- La página receptora compara exactamente sesión y materia. Un nonce de otro usuario/sesión/materia, expirado, malformado o ya consumido no presenta plan ni habilita su incorporación. El pase se consume solo después de verificar.
- Cambios de cuenta, sesión o Subject invalidan las continuaciones asíncronas por `useAsyncAuthorityFence`; las respuestas no pueden instalar el borrador en otra cuenta.
- Recarga del documento descarta la transferencia temporal. Para otra pestaña/dispositivo se mantiene el intercambio mediante JSON v1.
- El borrador del Planificador se recuerda también en `study-session-draft.mjs`, exclusivamente durante navegación entre rutas en la **misma pestaña y la misma cuenta/sesión/materia** (máximo 30 minutos, cinco ámbitos). Solo conserva campos del estudiante e IDs opacos; **no** guarda títulos de terceros, cuerpos, permisos ni URLs privadas. La acción «Vaciar mi borrador» reinicia el plan. Recargar el documento borra este estado volátil.
- El Planificador mantiene un mecanismo de revalidación del contenido al exportar Markdown/.ics o al recibir preguntas: los títulos no se reutilizan del borrador porque no se cachean fuera de la página.
- La memoria del módulo no contiene contraseñas, cookies, tokens ni URLs firmadas. El nonce de ruta no concede acceso a API ni a Resources.

## Experiencia de recepción

La página `/study/session` presenta una franja de "Continuar desde Práctica" con tres opciones:

1. **Sumar preguntas**: preservar título, notas, inicio, duración y progreso del plan original; agregar solo nuevos pares `(kind,id)`, sin duplicados.
2. **Reemplazar**: usar el plan de repaso entrante, con confirmación si hay tareas o notas previas.
3. **Descartar transferencia**: consume la referencia del ámbito correcto y limpia `location.state` sin modificar el plan.

Antes de aceptar cualquier opción, `normalizeStudySession` comprueba el formato y `verifyTaskLabels` vuelve a consultar **cada** Resource/Question de la materia con un máximo de cuatro solicitudes concurrentes, para obtener el nombre vigente o un marcador inaccesible. Los errores de red no se interpretan como pérdida de permisos y permiten reintento sin destruir el pase. No se confía en un título exportado.

Los límites se aplican sobre el **resultado completo**: máximo 24 tareas, 1.200 minutos y ninguna referencia duplicada. Si el plan combinado excede cualquiera, se rechaza atómicamente sin cambiar el original.

## Límite de alcance y relación con Colecciones

B43 **no** habilita los datos persistentes privados del PR #316. El export global de cuenta v1 garantiza **exactamente 30 secciones** y no incorpora aún `study_collections`; el cierre de cuenta actual desactiva identidad/sesiones, pero no debe describirse como borrado físico de todos los documentos privados. La integración de #316 requiere tratamiento explícito de portabilidad y retención antes de habilitar escritura para usuarios. No se altera silenciosamente el contrato de export v1 ni su semántica para artefactos ya emitidos.

## Matriz de aceptación

- [ ] Ejecución de `node scripts/test-web-study-session-handoff.mjs` en checkout real.
- [ ] Ejecución de `node scripts/test-web-study-session-draft.mjs` en checkout real.
- [ ] Ejecución de `node scripts/test-web-study-handoff-integration.mjs` en checkout real.
- [ ] Main Web typecheck/lint/format/build con dependencias instaladas.
- [ ] Practicar > marcar dos para repaso > pase directo a Planificador > suma y reemplazo.
- [ ] Conservación de 1 tarea ya revisada frente a una pregunta duplicada, incluyendo navegar de Planificador a Práctica y volver.
- [ ] Recarga elimina el borrador; otra cuenta/sesión/Subject no lo recupera; vencimiento 30 minutos; vaciado explícito.
- [ ] Límite 24 y 1.200 minutos en combinación, sin modificación parcial.
- [ ] Subject incorrecto, sesión/usuario distinto, nonce manipulado/expirado o pestaña recargada.
- [ ] Revocación de acceso antes de sumar, incluyendo fallos 403/404 y red interrumpida.
- [ ] Dos acciones simultáneas, navegación rápida, cambio de cuenta durante fetch.
- [ ] Teclado/móvil, confirmaciones accesibles, navegador atrás, descarga JSON alternativa.

La fusión de la rama certifica **integración de código**, no aceptación productiva; el QA de ejecución debe quedar trazado por SHA exacto.
