# B284 — Enlaces externos seguros en actividades públicas Mobile

## Contexto y comportamiento
La página pública Mobile incluye tarjetas de actividades con título, tipo, fechas y descripción (integradas en #744). La proyección del servidor también puede incluir `activity.url`. La antigua #624 vinculaba URLs a un componente de paginación que hoy todavía no está integrado; este carrier **no importa ese árbol apilado** y conserva íntegramente el estado actual de `main`.

- Solo se renderiza una acción cuando `profile.activities[].url` es una URL HTTPS absoluta, de 8 a 2048 caracteres, sin credenciales, espacios ni caracteres de control. No acepta HTTP, javascript, data ni esquemas personalizados.
- Se anuncia el dominio externo; la acción usa el diálogo de navegación del dispositivo mediante `Linking.openURL` **solo por toque explícito** (nunca automáticamente).
- Bloquea doble toque mientras está abriendo; un error de apertura se muestra junto a la actividad sin bloquear el resto del perfil.
- Desmontar la tarjeta evita escribir estado tras abandonar la pantalla; el componente lleva clave de autoridad y actividad para no conservar errores al cambiar cuenta/perfil.
- Las URLs nunca pasan a `fetch` dentro de la app. No se recopilan tokens, emails ni información de perfiles privados.
- Ausencia/URL inválida se omite silenciosamente y no aparece un botón inerte.

## Compatibilidad y pruebas
La integración reutiliza la política original de #624 y añade el rechazo explícito de espacios/controles que `new URL` puede normalizar, con pruebas adversariales nuevas. Su componente es independiente y la inserción en `search-result-screens.tsx` preserva los avatares B273, compartir perfiles B268, intereses B271 y detalles B276.

**Validación obligatoria en HEAD exacto:** Node24/pnpm9 frozen, TypeScript, ESLint, Prettier, suite Mobile, Expo iOS/Android export, Quality Gate y 10 coberturas críticas, Container runtime smoke, `pnpm audit --prod --audit-level high`. Sin cambios de Auth, API, Mongo, contratos, migraciones, dependencias, lockfile, flags o CI.

La auditoría HIGH de node-forge (#133) y Zod (#705) continúa siendo bloqueo de **producción**, aunque otras pruebas de esta PR pasen. No se desactiva ni se introduce una excepción. La histórica #624 solo puede cerrarse como reemplazada cuando la nueva integración conserve efectivamente el comportamiento.
