# Mobile — Q&A contextual desde el preview de Guardados en Inicio

**Bloque 18.** Extensión acotada del flujo de valor
`Inicio → Guardados → apunte → materia → preguntas`.

## Comportamiento implementado

- Los hasta tres recursos de la tarjeta «Retomá tus guardados» siguen viniendo
  del endpoint de guardados existente, con revalidación por cuenta, foco y
  contexto académico.
- Cada recurso dispone de un botón **Abrir apunte** y, si el Subject tiene UUIDv4
  canónico, otro botón separado **Preguntas de la materia**.
- El segundo botón usa `savedSubjectQuestionsAction`, helper compartido con
  la biblioteca de Guardados, y abre la ruta
  `/questions/subjects/[subjectId]` ya disponible.
- Los botones son hermanos, no controles anidados, y la navegación de detalle
  se mantiene intacta.
- El texto deja de afirmar que el estudiante ya abrió antes el apunte: un
  material puede haberse guardado directamente desde Buscar sin visualizarlo.
- El feedback y la ruta a toda la biblioteca se conservan. No hay cambio de
  backend ni nueva relación, caché, evento o permiso.

## Autoridad y restricciones

- Una relación «guardado» solo autoriza al servidor a **evaluar** el contenido;
  no concede acceso perpetuo ni participación académica.
- La página Q&A utiliza su gate de sesión/contexto para leer resultados. Publicar
  sigue requiriendo la materia actual elegible; la navegación no inscribe al
  estudiante ni altera sus datos.
- Si el Subject es inexistente, legado, malformado o no UUIDv4, el CTA no se
  renderiza.
- Si el recurso ya no es legible, el backend de detalle reautoriza y Q&A hace
  su propia comprobación; el preview no presenta enlaces a archivo firmados.

## Aceptación pendiente

| Escenario | Resultado |
| --- | --- |
| Recurso guardado con Subject canónico | Detalle y Q&A separados y visibles |
| Recurso con Subject inválido | Solo detalle, sin Q&A |
| Cambio de sesión durante carga | No renderizar proyecciones de otra cuenta |
| Lectura Q&A sin participación actual | Lectura autorizada, creación no concedida |
| Desde Inicio a Q&A y «Volver» | Regresa al contexto de navegación |
| TalkBack/VoiceOver | Dos botones individuales, labels y hints comprensibles |
| Guardado con save pero nunca abierto | CTA «Abrir», no «Volver a abrir» |
| Error de red en preview | Reintento existente, sin éxito falso |

**Evidencia:** prueba de wiring/política en
`apps/mobile/test/home-saved-subject-questions.test.ts` y suites heredadas
`saved-subject-questions-action.test.ts` / `home-saved-return.test.ts`.

**Sin ejecutar:** CI, tests, typecheck, compilaciones, QA Android/iOS y lector
de pantalla. Este bloque sólo pasa a *validado* tras el gate conjunto del
commit exacto de `main`.
