# Estadísticas de Mis apuntes — bloque 13

## Auditoría de fuentes previa

Se inspeccionaron `ResourceService`, `ResourceStore`,
`MongoResourceStore`, los esquemas `resources`, `resource_saves` y
`resource_shares`, el servicio de telemetría piloto y la biblioteca
Mobile `Mis apuntes`.

**Datos disponibles y verificables:** publicaciones vigentes por visibilidad,
registros de guardado existentes y concesiones individuales existentes.
**Datos NO disponibles:** cantidad histórica de visualizaciones, usuarios que
realmente leyeron un archivo, descargas completadas, vistas únicas, tiempo de
lectura, impacto académico y series temporales de interacción por recurso.
El endpoint de acceso genera intenciones/URLs firmadas, no certifica que el
contenido haya sido transferido o leído. No se muestra una métrica falsa
de «visitas» ni se modifica el flujo de archivos para fabricarla.

## Endpoint de estadísticas

`GET /resources/mine/stats`:
- requiere `AuthSessionGuard` y `VerifiedEmailGuard`;
- desactiva cachés con `Cache-Control: private, no-store`;
- obtiene la identidad del autor de la sesión verificada, sin aceptar
  `authorUserId` ni otro perfil por query;
- calcula cifras en MongoDB únicamente sobre recursos del autor con
  `moderationState=available`;
- usa un único pipeline de agregación con `$lookup` acotados por
  `resourceId`, `$count` por colección de permisos/guardados y `$facet`;
- cuenta concesiones individuales **solo si el recurso sigue en estado
  `shared`**. No cuenta grants residuales al pasarlo a Privado/Público;
- el ranking de cinco apuntes se ordena por guardados vigentes (descendente),
  permisos vigentes como segundo criterio y recurso ID para desempates.

### Respuesta

```json
{
  "generatedAt": "2026-10-12T12:00:00.000Z",
  "publications": {
    "total": 3,
    "private": 1,
    "shared": 1,
    "public": 1
  },
  "currentSaves": 8,
  "activeShareGrants": 2,
  "topResources": [
    {
      "id": "resource-id",
      "title": "Guía de Álgebra",
      "visibility": "shared",
      "saves": 5,
      "shareGrants": 2
    }
  ]
}
```

**Semántica:**
- `currentSaves`: filas guardadas en `resource_saves` para los apuntes
  disponibles del autor. **No** es el número de lectores únicos; una persona
  que guarda dos apuntes cuenta dos guardados. Si se restringió el acceso a
  un recurso, podría conservarse un registro de guardado histórico vigente
  para un usuario que ya no puede abrirlo. La consulta no interpreta
  ese registro como acceso o lectura.
- `activeShareGrants`: permisos explícitos existentes sobre recursos con
  visibilidad Compartido. Una persona con acceso a dos recursos cuenta dos
  permisos. No incluye al público general de recursos públicos.
- `publications`: recursos disponibles del autor, no todos los uploads
  históricos ni los borradores de archivos sin recurso publicado.
- `topResources`: máximo cinco recursos disponibles del autor. Si el
  recurso no tiene guardados ni permisos, aparece con cero.

Las cifras se consultan al cargar/refrescar la pantalla, no representan
un snapshot transaccional de múltiples colecciones durante escrituras
concurrentes. `generatedAt` señala el instante de respuesta, no un tiempo
de recolección histórica.

## Experiencia Mobile

**Perfil → Mis apuntes → Ver mis estadísticas**, ruta
`/my-resource-statistics`. La pantalla muestra resumen por visibilidad,
guardados actuales, permisos individuales y ranking de recursos; cada fila
del ranking abre su detalle autorizado existente. Incluye estados de carga,
error, retry y actualización, hora de la consulta y explicación del alcance
de las métricas. No se almacena información privada del autor en disco.

La API Mobile consulta con credencial vigente y comprueba nuevamente la
autoridad de sesión después de recibir respuesta. El controlador mantiene
un snapshot solo mientras la pantalla está enfocada y la app activa;
cambio de sesión, foco o estado de app cancela peticiones, limpia datos y
descarta respuestas anteriores.

## Verificaciones manuales pendientes

1. Cuenta A sin publicaciones: todos los conteos cero y ranking vacío.
2. Publicar 3 recursos (uno por visibilidad) y comprobar desglose por estado.
3. Cuenta B guarda el recurso Público: el total de guardados de A aumenta.
   Al quitar el guardado, el total baja; no hay una métrica histórica.
4. Conceder dos permisos en un recurso Compartido: suma dos grants.
   Revocar uno: disminuye a uno.
5. Pasar Compartido a Privado/Público: grants activos del recurso pasan a
   cero. Al volver a Compartido, los permisos no se recrean.
6. Guardar dos recursos de A desde B: se cuentan dos guardados, no un
   «usuario único».
7. Confirmar que una cuenta C no puede consultar stats de A y que los
   registros ocultados por moderación quedan fuera de las cifras.
8. Comparar el ranking con consultas directas a Mongo y verificar orden
   por guardados y desempates.
9. Cambiar de cuenta durante una solicitud o salir de Mobile: cifras
   anteriores no quedan visibles.
10. Cortar red: el error no muestra «cero» inventado. Reintentar refresca
    los números en vez de sumarlos.
11. Probar VoiceOver/TalkBack, foco, barras y apertura del detalle desde
    los cinco puestos en iOS/Android.
12. Verificar rendimiento del pipeline con un autor de muchos recursos e
    índices sobre `authorUserId`, `resource_saves.resourceId` y
    `resource_shares.resourceId`. Evaluar materialización si el volumen
    real justificara optimizar; no inventar cachés que puedan quedar obsoletos.

## Integración y calidad

Los commits usan `[skip ci]` por pedido del usuario. Los tests nuevos
quedan escritos, pero NO se certifican como ejecutados. También quedan
pendientes tipado, lint, formateo, builds API/Expo, pruebas con usuarios
reales y revisión de índices Mongo. La auditoría general de dependencias
no se altera. La integración vía PR y merge commit **no constituye
aprobación para lanzamiento a producción**.
