# B184 — Aceptación de estudio en Chromium con API y MongoDB reales

Estado: prueba integrada al candidato Draft B182 (#518), **sin merge ni despliegue**.

## Brecha que resuelve

B183 comprueba el recorrido visual React/Chromium con API simulada; B182 aporta smoke real de autenticación y recursos, pero no comprueba **la combinación completa** con la interfaz del Planificador. B184 agrega una prueba **sin mocks de red**, ejecutada *al final* del job global `Container runtime smoke` y sólo después de levantar los servicios de `compose.local.yml` + `compose.health.yml`.

## Datos descartables con autoridad real

El archivo `scripts/browser-study-journey-live-b184.mjs` requiere `CI=true`, `assertLocalAuthSmokeMongo` y un `/health/ready` disponible. El job ya selecciona un kernel compatible con Mongo 8; al finalizar siempre destruye los contenedores y volúmenes. Se crean dos cuentas únicas con emails `@example.test`, se verifica su correo mediante Mongo local exclusivo del smoke y se obtienen sesiones válidas a través de la API. No se usan usuarios, tokens o endpoints productivos.

- Se usa el catálogo académico que siembra el smoke de Academic: institución, programa, plan y **Base de Datos**. El estudiante se afilia y declara participación actual, comprobada contra Contextual Discovery.
- El autor carga un PDF mínimo y lo publica como recurso público; se crea una pregunta real para la misma materia.
- El estudiante inicia sesión mediante **el formulario React y cookie HttpOnly en Chromium**, busca el apunte y lo guarda, y se confirma la escritura leyendo su biblioteca con API real.
- Desde la ficha del recurso, el autor cambia visibilidad a **private**. El botón «Preparar sesión con este apunte» debe rechazar la transferencia; se comprueba además que el GET autorizado del estudiante retorna 403/404. Al restablecer `public`, el mismo botón debe iniciar el pase válido.
- El estudiante confirma **Sumar actividades sin perder mi plan**; se comprueba una actividad. Busca la pregunta real, suma 20 minutos y confirma **dos actividades / 45 minutos**. Finalmente crea un kit portable y agrega el apunte mediante búsqueda.
- No se permiten excepciones sin controlar en la página. La prueba se ejecuta contra API real; ningún request se sustituye mediante `page.route` o fixtures interceptados.

## Límites y controles de seguridad

- Sólo Compose local de CI, email ficticio, random UUID; no credenciales hardcodeadas ni cambios en permisos de producción.
- Con autorización real de la API, incluida la revocación entre la lectura y la acción.
- La ejecución permanece subordinada a `Quality Gate`, coberturas críticas, smoke Mongo/API y auditoría productiva **sin excepciones**.
- No se implica persistencia del Planificador: el borrador y el kit siguen siendo temporales, según sus propias reglas.
- El test mide este recorrido controlado; no sustituye pruebas manuales de accesibilidad, cuotas, tiempos prolongados ni todas las combinaciones de estados.
- Release #353 permanece **HOLD** por dos HIGH sin parche certificado en `node-forge` y `braces`; no merge o deploy mientras estén pendientes.

## Evidencia

1. Check `Node24 B184 live study fixture and canonical source checks` confirma forma y protección del runner, no prueba funcional.
2. Sólo el check **Container runtime smoke** sobre el mismo SHA puede establecer PASS real, porque ejecuta el B184 después de los 12 smokes anteriores y valida el entorno completo y teardown.
3. Si falla, registrar el paso, el error exacto y corregir el script o el producto antes de volver a presentar el bloque como aprobado.
