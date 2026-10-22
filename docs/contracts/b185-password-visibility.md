# B185 — Visibilidad voluntaria de contraseñas (Web)

**Fecha:** 22/10/2026. **Base del carrier actual:** `main@4cf5356efbf54eae125d1eb5b40a802497538c82`. **Alcance:** Login, Registro, Reset Password y Seguridad. **No altera autenticación ni políticas.**

El PR #521 se preparó originalmente sobre una base anterior e incluía un workflow dedicado. Este carrier fue reconstruido sobre el `main` actual, conserva sus commits atómicos funcionales y excluye ese workflow. No se añade ni modifica ningún archivo de `.github/workflows/`.

## Necesidad de usuario

La contraseña de Los Apuntes permite frases largas y Unicode. Un campo siempre oculto puede dificultar detectar errores de escritura en equipos propios. La aplicación ahora ofrece el control **Mostrar / Ocultar** en cada campo de contraseña. Está **oculto por defecto** y revelar requiere un clic consciente. La elección afecta solo a ese campo y esa página, sin almacenar ninguna preferencia.

## Flujo y seguridad

1. Todos los campos parten con `type=password`, incluso cuando el navegador rellena el formulario mediante su gestor de contraseñas.
2. El control nativo `type=button` tiene `aria-controls`, `aria-label` por campo y `aria-pressed`; no envía formularios, no cambia valores ni interfiere con el tabulado de teclado.
3. Se alterna el atributo **del mismo input** (no se lo destruye ni remonta). Esto conserva el valor, el `ref` que usa React Hook Form, validadores, etiquetas, `autoComplete=current-password/new-password`, maxlength y eventos originales.
4. Contraseña y Confirmar contraseña se revelan **independientemente**. En Seguridad, cambiar/confirmar contraseña y la reautenticación para modificar Google usan el mismo control.
5. Cuando la ventana pierde foco o el documento deja de estar visible, todos los campos revelados vuelven a `type=password`. Los listeners se liberan al desmontar; los controles deshabilitados no muestran valores.
6. No hay copia de contraseña, registro de pulsaciones, efectos de red, almacenamiento, telemetría, consola, URLs nuevas, credenciales de terceros ni analytics.
7. El botón mantiene altura mínima de **44 px**, estilo `focus-visible` y disposición móvil. La opción está disponible también con teclado y lector de pantalla.
8. El usuario sigue siendo responsable de revelar secretos solo en un lugar seguro. Esta función **no cambia** la política de contraseñas ni autoriza mostrar contraseñas sin consentimiento.

## Integraciones

- `LoginForm.tsx`: contraseña de inicio de sesión con React Hook Form, sin cambios en `register()`, OAuth, errores ni navegación.
- `SignUpForm.tsx`: contraseña y confirmación con controles independientes; se conservan la validación de al menos 15 caracteres y la comparación entre campos.
- `ResetPassword.tsx`: nueva contraseña y confirmación. El token de recuperación sigue siendo extraído del fragmento y retirado del historial como antes. No se altera ninguna llamada de inspección o uso del token.
- `Security.tsx`: contraseña actual, contraseña nueva, confirmación y reautenticación para gestionar la conexión con Google. Se conserva `useAsyncAuthorityFence`, la autorización de la sesión y los botones de acciones.
- `PasswordField.tsx`: implementación única con input nativo, `forwardRef` y estado local. `PasswordField.scss`: botones y foco accesibles.

## Criterios de aceptación y pruebas

- **11 verificaciones deterministas** de máscara por defecto, identidad de input, pérdida de foco, estado deshabilitado, ARIA, integración de React Hook Form, dos campos independientes, continuidad de recuperación, Seguridad, CSS mobile, ausencia de rutas de almacenamiento o telemetría.
- **Prueba Chromium real** con Vite loopback y respuestas HTTP simuladas para los cuatro recorridos. Verifica máscara inicial, mostrar/ocultar, no pérdida de valor, autocompletado sin cambios, restauración de máscara en blur, independencia de registro, inspección del enlace de recuperación sin exponer el token y sesión autenticada en Seguridad. Las acciones de mostrar/ocultar no crean llamadas de modificación de credenciales.
- `pnpm test:web-password-visibility-b185` agregado al `pnpm test` principal. La validación local del carrier incluye pruebas deterministas, Chromium, tipos, lint, formato y build Web.
- No se ejecutó CI desde este carril. GitHub puede iniciar automáticamente sus checks existentes al actualizar o abrir la PR.

Validación local sobre el carrier actual, basado en `main@4cf5356efbf54eae125d1eb5b40a802497538c82`:

- `corepack pnpm install --frozen-lockfile --filter los-apuntes --filter @losapuntes/web...` — PASS.
- `corepack pnpm test:web-password-visibility-b185` — PASS, 11/11.
- `node scripts/test-web-password-visibility-b185-browser.mjs` — PASS, cuatro recorridos en Chromium.
- `corepack pnpm --filter @losapuntes/web check:types`, `lint`, `format:check` y `build` — PASS.
- `git diff --check origin/main...HEAD` — PASS.

## Límites y release

No constituye un gestor de contraseñas, desbloqueo biométrico ni sustituto de autenticación. No modifica APIs, base de datos, Mobile, dependencias, lockfile, controles de tokens ni excepciones del audit.

Los avisos HIGH de `node-forge` #133 y `braces` #141 mantienen el audit productivo en rojo; el hallazgo de `follow-redirects` se corrigió en B190. Este bloque no crea excepciones ni certifica el audit. **#353 permanece HOLD y el release requiere resolver sus gates de seguridad y aceptación.**
