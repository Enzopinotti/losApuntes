# Bloque 44 — Colecciones portátiles por materia (sin persistencia en servidor)

**Contexto:** PR #316, Study Collections persistentes, está en borrador.  
**Dependencias existentes:** B40 Mesa de estudio, B41 Planificador de sesiones, B43 pase temporal, API Resources y Discovery.

## Propósito

El estudiante puede organizar material visible en conjuntos independientes para un parcial o final. Esta iteración ofrece una alternativa **realmente utilizable y portable** sin incorporar datos privados persistentes que la exportación general de cuenta v1 no contemple. **No equivale a habilitar el modelo Mongo** del PR #316, ni reemplaza su planificación de lifecycle. 

### Interfaz

Ruta autenticada `/study/kits?subjectId=<UUIDv4>`, accesible desde Mesa y Planificador. La materia debe figurar entre las primeras ocho materias actuales que devuelve `/discovery/contextual`. No basta un UUID de URL para conceder acceso.

- Crear hasta **12 kits por materia** con título y notas propias; editar y eliminar.
- Agregar hasta **24 apuntes por kit**, sin repetidos; quitar y reordenar.
- Fuentes independientes paginadas: `/resources/saved/search?subjectId=...` y `/resources?subjectId=...`.
- Consultar títulos **siempre** con `GET /resources/:id` al mostrar cada kit; concurrencia máxima 4, AbortSignal y fence de `account/session/subject/kit/IDs`.
- Los identificadores revocados, moderados o de otra materia aparecen **sin título** y pueden quitarse. Fallas de red se muestran como error y no como revocación.
- Exportar/importar JSON portable versionado (incluye solo UUIDv4 de materia/kit/recurso y texto escrito por el dueño). Importar reemplaza los kits de esa materia con confirmación; no otorga visibilidad a ningún recurso.
- Abrir un kit en el Planificador utilizando un nonce temporal en memoria de B43; cada recurso se valida nuevamente por la autoridad del servidor antes de incorporarse al plan. El pase no incluye metadatos privados en el historial.
- Limpiar explícitamente el espacio temporal; no hay guardado silencioso en Mongo, localStorage, cookies, IndexedDB ni archivos.

## Contrato portable

`losapuntes.portable-study-kits` versión 1, máximo 65.536 bytes UTF-8:

```json
{
  "format": "losapuntes.portable-study-kits",
  "version": 1,
  "subjectId": "11111111-1111-4111-8111-111111111111",
  "kits": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Primer parcial",
      "notes": "Priorizar unidades 1 y 2",
      "resourceIds": ["33333333-3333-4333-8333-333333333333"]
    }
  ]
}
```

No hay nombres de archivos de terceros, URLs firmadas, nombres de autores, sesiones ni grants. El parser exige estructura exacta, versión, UUIDv4, NFC, límites, ausencia de duplicados y coherencia con Subject activo. Archivos de otros Subject deben abrirse seleccionando primero la materia correcta.

### Duración y limitaciones

El trabajo en la misma pestaña se conserva en **memoria JavaScript durante 30 minutos** por `status:user:session:subject`, con máximo cinco ámbitos en memoria. Un reload **lo descarta**. Es necesario exportar para conservar información entre recargas o dispositivos. Nunca afirmar sincronización por cuenta.

## Política de ciclo de vida

El modelo persistente en #316 sigue **sin activar**. La exportación general de cuenta versión 1 contiene exactamente 30 secciones y no incluye `study_collections`; además, el cierre actual de cuenta no equivale a un borrado físico general. B44 no altera ni amplía esa exportación ni crea ningún dato servidor. Para liberar #316 más adelante, resolver versión de exportación, retención/offboarding, esquema canónico y QA Mongo. **Este contrato portable no concede permisos duraderos.**

## Verificación y aceptación

- `node scripts/test-web-study-portable-kits.mjs`: round-trip, límites, formato, duplicados, export a sesión.
- `node scripts/test-web-study-kits-integration.mjs`: ruta privada, fuentes, aislamiento, revalidación, descarga y UI.
- Pendientes por gate exact-head: Prettier, typecheck, build, QA browser, peticiones reales a Resources/Discovery, auditoría de dependencias.
- Casos manuales: crear/editar/quitar; 12/24 límites; importación de otra materia; 403/404; error de red; cambio de sesión con importación en vuelo; reload; descargar/recuperar en otro dispositivo; pasar al Planificador y sumar/reemplazar; foco/teclado/responsive.

**El merge de código NO certifica producción.**
