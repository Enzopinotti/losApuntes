# Web accessible destructive confirmation

Issue: #85.

This note defines the first reusable Web confirmation boundary for destructive account actions. It replaces browser-owned `window.confirm()` behavior without changing backend authority or the destructive operation itself.

## Contract

`ConfirmDialog` uses the native modal `<dialog>` top layer through `showModal()`.

The component must:

- expose an accessible name and description;
- keep background interaction outside the modal while it is open;
- give initial focus to the non-destructive Cancel action;
- treat Escape as Cancel;
- restore focus to the control that opened the dialog;
- allow pointer/touch backdrop cancellation only when the same pointer starts and ends on the backdrop;
- never treat a pointer that starts or ends on dialog content as outside dismissal;
- preserve visible keyboard focus;
- respect reduced-motion and forced-colors preferences;
- never make the destructive action the default focused control.

The parent remains responsible for executing the server-authoritative mutation only after explicit confirmation.

## Security Settings integration

The first consumer is **Cerrar todas las sesiones** in Web Security.

Opening the dialog does not mutate session state. Confirming invokes the existing `revokeAllSessions` path. Cancelling leaves all sessions unchanged. If the mutation later fails, the user returns to the existing Security error/retry surface.

The modal does not introduce a second auth or permission rule.

## Deliberate limits

This carrier does not claim that every Web overlay has been migrated to the same primitive. Issue #85 remains open for the wider focus/overlay/virtual-keyboard/accessibility audit.

Backdrop dismissal is supported, but it is deliberately pointer-safe: the same pointer must begin and end on the backdrop. A press that starts inside the dialog, releases inside the dialog, changes pointer identity, or is cancelled cannot dismiss it. The backdrop path maps only to Cancel; it never confirms the destructive action.

## Verification

Run:

```bash
node scripts/test-web-accessible-confirm-dialog-contract.mjs
pnpm --filter @losapuntes/web check:types
pnpm --filter @losapuntes/web lint
pnpm --filter @losapuntes/web build
```

The standalone contract is intentionally not wired into the root package scripts in this carrier because root `package.json` is owned by another active integration lane.
