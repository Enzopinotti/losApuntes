# Web Q&A: shareable public discovery with stable request authority

**Candidate baseline:** `main@13b45569874703b293bb484482e0ecc96d383934`.
**Scope:** Web Q&A discovery only. No API/Mobile schemas, auth policy, database or dependency changes.
**Plan:** reconcile current Frontend backlog before marking the product milestone `done` (do not invent a ledger key).
**Release status:** implementation candidate; verify exact-head CI and browser acceptance independently.

## User-visible behavior

- The public `/questions` listing now reads `q` (2..120 characters) and `status` (`open` or `closed`) from URL search parameters, alongside the existing canonical `subjectId`.
- The query text and status picker are local **drafts** until the user submits **Buscar**. Typing no longer starts a new server query on every keystroke.
- **Limpiar búsqueda** removes only `q`, `status` and previously opened `id`. The canonical subject filter stays intact.
- Selecting another subject retains the current applied search and status, but closes the old detail.
- Browser Back/Forward and shared URLs restore the applied filters. Opening a question retains its discovery URL context; **Volver a resultados** returns to the filtered list, without the detail ID.
- **Copiar búsqueda** and **Abrir enlace de búsqueda** expose a canonical public URL containing only `subjectId`, `q`, and `status`, never a cursor, question `id`, session token, or router state.
- The previous subject-only copy link remains available in the subject widget.

## Safety and authority

Malformed or duplicated `q` or `status` filters produce **no list request**; show a recovery message instead of broadening results. Existing invalid/duplicated subject UUID logic remains fail-closed. Trimming and canonicalizing do not change API authorization, moderation or reporting rights. The request still includes credentials from the existing service, and the session-scoped async authority fence still rejects stale responses.

No new localStorage or sessionStorage, client-side role grants, automatic POST retries, background request pollers, or third-party dependencies.

## Acceptance

- `pnpm test:web-social-qa-contract` exercises the pure public URL cases and canonical Web Social/Q&A source guards.
- Verify API/Web/Mobile formatting, Web and API TypeScript, Web lint, relevant critical domain coverages and `pnpm check` on the exact PR SHA.
- Browser acceptance should manually cover URL copy/reload, Back/Forward, subject preservation, malformed parameters, anonymous discovery and keyboard/touch actions.
- This does not unblock production while the HIGH dependency-audit gate is failing. No audit waivers are included.
