# Mobile — Volver a estudiar desde Inicio (bloque 15)

**Carrier:** `feat/mobile-home-return-to-saved-20261012`  
**Requisitos reutilizados:** `RES-FR-008`, `RES-FR-009`, `MOB-FR-001/005/007/008`, `NFR-SEC-001`, `NFR-PERF-001`.  
**Estado:** implementado en código candidato; sin CI, builds ni aceptación en dispositivo.

## Necesidad y decisión

Quien ya guardó un apunte no debería depender de recorrer Perfil para retomar
una actividad útil. Inicio ofrece un acceso directo a los materiales guardados
sin inventar una segunda biblioteca ni un historial de lecturas.

La superficie se llama **Retomá tus guardados**, no «últimos leídos» ni «seguir
donde lo dejaste». El backend actual conoce el orden de guardado, pero no
registra una posición de lectura verificable. No se almacenan recursos, términos
de búsqueda, URLs firmadas ni datos académicos adicionales en el dispositivo.

## Implementación

- `HomeSavedReturnCard` se monta en la Home autenticada, entre el acceso a
  crear contenido y Notificaciones. Mantiene el feed virtualizado existente.
- Consume la operación compartida `ResourceConsumptionApi.saved` contra
  `GET /resources/saved`. No hay endpoint paralelo ni modificación al backend.
- La API devuelve una primera página **acotada a 25 guardados** en orden de
  guardado descendente y filtra recursos que el actor ya no puede leer.
- La tarjeta muestra hasta **tres** recursos distintos, conservando el orden
  de la página autorizada. Si existen otros resultados/cursor, lo aclara.
- Cada recurso abre `/resources/[id]` y esa pantalla vuelve a autorizar
  la lectura y la entrega del archivo; un save no transfiere derechos.
- «Ver todos mis guardados» abre la biblioteca existente. Una biblioteca vacía
  ofrece la ruta ya disponible hacia Buscar.
- La consulta solo vive mientras Inicio está enfocado, la app activa y la
  autoridad de sesión/contexto coincide. Salir, cerrar sesión, cambiar usuario
  o cambiar de contexto cancela la petición, invalida el estado y descarta
  respuestas tardías; al volver a Inicio se consulta de nuevo.
- Fallos de red, timeout, restricciones y errores se expresan por separado,
  con reintento explícito. La tarjeta nunca interpreta una falla como vacío.
- Una primera página sin items pero con cursor no implica que la biblioteca
  completa esté vacía: quizá se revocó visibilidad de guardados recientes.

## Límites deliberados

- «Recientes» describe **orden de guardado**, no orden de apertura ni progreso.
- El recorte de tres es un preview, no una búsqueda en toda la colección.
- No hay cache offline, tracking de lectura, sincronización entre dispositivos
  de posición, telemetría nueva, almacenamiento local ni permisos nuevos.
- El componente no depende de `HomeFeedController`, no modifica su ranking,
  paginación ni scroll. Los únicos cambios en Home son importar y montar
  la tarjeta.

## Matriz de aceptación y evidencias pendientes

| Escenario | Comportamiento esperado |
| --- | --- |
| Tres guardados accesibles | Mostrar tres accesos y abrir detalle existente |
| Más de tres / cursor | Mostrar máximo tres; derivar a biblioteca |
| Sin guardados y sin cursor | Explicar estado vacío y ofrecer Buscar |
| Primera página filtrada por permisos con cursor | No declarar vacía toda la colección |
| Guardado revocado luego del preview | El detalle reautoriza y falla cerrado |
| Cambio A → B mientras responde una consulta | Abort + fence; ningún item de A aparece para B |
| Cambio de materia/contexto o app en background | Limpiar respuesta anterior; consultar al volver |
| Sin red, timeout y 403 | Mensaje contextual y reintento, sin success falso |
| Clic con VoiceOver/TalkBack | Botones con label y destino comprensibles |

**Pruebas agregadas, no ejecutadas:** `apps/mobile/test/home-saved-return.test.ts`
cubre orden, deduplicación, límite, cursor, fencing, abort, errores y wiring.
Antes de marcar como VALIDADO correr el quality contract sobre el SHA final y
hacer aceptación Android/iOS (incluyendo lector de pantalla, navegación,
retorno desde detalle, conexión intermitente y cambios de cuenta/contexto).

**Integración:** si el PR se fusiona con `[skip ci]`, conservar el SHA de
merge como `integrado / no validado` en el registro conjunto; no atribuirle
un run de otro SHA ni afirmar release readiness.
