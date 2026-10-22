# B94 — Aceptación completa y comprobable de exportaciones (B86/B90/B93)

**Base:** `main@d0b25da91ac56b2a7da2ad041b005a759e13f42e` (B93).  
**Estado de release:** issue #353 OPEN/HOLD; `STUDY_PROGRESS_ENABLED=false`. No CI manual ni despliegue.

## Falla de cobertura detectada

B86 creó el comando `pnpm test:account-export-b86-local-acceptance` para ejecutar pruebas reales de MongoDB (replica set aislada) con el adaptador S3 de la aplicación, reemplazando solo el transporte HTTP de S3 por un mock. B90 agregó un caso de lectura S3 corrupta antes de publicar y B93 agregó dos casos de reloj del primario y generación vigente/retirada a **la misma suite** `study-progress.mongo-int.spec.ts`.

No obstante, el comando original seguía pasando a Jest `--testNamePattern B86`. Por lo tanto, únicamente seleccionaba **2 de los 5 escenarios** y dejaba B90/B93 fuera de la aceptación incluso cuando el proceso terminaba con código 0. Adicionalmente, `--passWithNoTests=false` únicamente protege contra cero tests totales: no demuestra que hayan corrido *todos* los escenarios obligatorios.

## Corrección B94

Nuevo contrato puro `scripts/testing/b94-mongo-acceptance-plan.mjs` con cinco nombres exactos y patrón de selección `B(?:86|90|93) `:

| Bloque | Escenario que debe aprobar |
| --- | --- |
| B86 | ACK de PUT perdido, B80/B82, 503 DELETE, reintento durable |
| B86 | Generación completada preservada sin DELETE |
| B90 | S3 GET con bytes corruptos rechaza publicación |
| B93 | Mongo primario autoriza la generación vigente, aunque worker adelante reloj |
| B93 | Mongo primario deniega vencida o generación retirada |

El runner B86 existente, sin cambiar su nombre histórico ni su bandera de habilitación, ahora:

1. Continúa rechazando URI remotas/credenciales/alias no validado a través del helper B89, fijando destino loopback numérico y `directConnection=true`.
2. Exige Node24, flag de producción desactivada y URI Mongo local explícita.
3. **Antes de iniciar Jest**, lee la suite del repositorio y valida que contenga exactamente una ocurrencia de cada uno de los cinco títulos y ningún escenario seleccionado adicional o renombrado. Si faltan casos aborta con código 2.
4. Ejecuta Jest solo sobre esa suite y el patrón de los tres bloques. Escribe un reporte JSON a un directorio privado temporal del sistema. No hay CI ni otro servicio remoto.
5. Incluso si Jest devuelve 0, **verifica el JSON**: éxito global, un único archivo de suite con path esperado, exactamente cinco assertions seleccionadas con títulos obligatorios, estados `passed`, mensajes de falla vacíos, ninguna duplicación. Tests ajenos, intencionalmente omitidos por `--testNamePattern`, se ignoran sin confundirlos con los cinco requeridos.
6. Si falta el reporte, está malformado, alguna assertion es `pending`, `skipped`, `failed`, `todo`, cambió el título o la ejecución terminó con error, devuelve código no cero.
7. Limpia el reporte temporal al terminar. No muestra URIs, contraseñas, payloads exportados ni claves privadas en logs.

## Verificación ejecutable

`scripts/test-account-export-b94-acceptance-plan.test.mjs` prueba el contrato con reportes sintéticos y con los títulos existentes en la suite real del repositorio. Cubre positivo 5/5, omisiones, falla individual, título nuevo, duplicación, cambio de archivo, JSON malformado, error global y que una suite sin cobertura B90 no se marque como aprobada. No requiere MongoDB, pnpm, Jest ni credenciales.

`scripts/test-account-export-b94-guard.mjs` asegura la presencia de la selección completa, validación **antes** de `spawnSync`, límites locales B89, comprobación del reporte y conexión al script del proyecto. Ambos se agregaron a `test:account-lifecycle-contract` y al comando `test:account-export-b94-proof`.

## Ejecución de aceptación real (pendiente)

Con Node24/pnpm9, dependencias locales del repositorio instaladas y un replica set **descartable** accesible únicamente desde loopback (el runner jamás crea/elimina bases externas):

```bash
pnpm test:account-export-b94-proof

STUDY_PROGRESS_ENABLED=false \
STUDY_PROGRESS_TEST_MONGO_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' \
pnpm test:account-export-b86-local-acceptance
```

El segundo comando es el que ejecuta MongoDB **de verdad**. Requiere que el primario sea una replica set local válida, y deja la misma base de prueba aleatoria a cargo del teardown de la suite. Un resultado `5/5` del comando corresponde a Mongo y S3 adapter real **con transporte HTTP de S3 simulado**; NO demuestra comportamiento de AWS/MinIO, permisos IAM, Object Lock, versioning, lifecycle, backups ni navegadores.

**No levantar issue #353** hasta completar Node24/pnpm9 Jest/TypeScript/lint, prueba real de Mongo y proveedor S3, descarga HTTP/browser y auditorías #133/#141. No activar `STUDY_PROGRESS_ENABLED` ni CI manual.

## Otros carriles

Las PRs de calidad #400/#408/#399/#404/#407/#405/#403 y las antiguas deben rebasear el nuevo `main` antes de integrarse, preservando las pruebas B86/B90/B93 y el contrato B94. Un cambio intencional de títulos requiere revisar manifest y resultados, nunca desactivar la comprobación de aceptación.
