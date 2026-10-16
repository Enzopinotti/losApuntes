# B84 — Contratos de tests de exportación y colecciones para ESLint estricto

Fecha: 2026-10-16. Candidato derivado del `B83@1a2fde81f41dbd07529a22fb271de5c5aa1e24a1` (PR #387); rama: `fix/b84-account-export-study-fixture-eslint-20261016`.

## Objetivo

Eliminar errores de ESLint en **cuatro archivos de pruebas** sin cambiar la semántica de seguridad del API, persistencia de Mongo, S3, resolución de exportaciones o lógica de dominio. El Quality Gate de B83 marcó **248 errores y cero advertencias** en API, tras resolver 251 diagnósticos previos. B84 interviene un grupo de **17 diagnósticos históricos** en archivos sin solapamiento con el carril #388 de guards, planes y versionado.

## Invariantes de las correcciones

| Archivo | Hallazgo | Tratamiento |
| --- | --- | --- |
| `data-lifecycle/domain/account-export.service.spec.ts` | 8 callbacks `async` sin `await` y un escape inválido en título | Los mocks `requestActive` siguen devolviendo una `Promise` con `Promise.resolve`; conservar escenarios de v1/v2/v3, flags y usuarios; corregir exclusivamente escape del texto |
| `data-lifecycle/account-export.controller.spec.ts` | 2 generators `async` sin `await` en payloads v2/v3 | El iterator mantiene contrato `AsyncIterable` mediante `yield await Promise.resolve(chunk)` |
| `study-collections/mongo/mongo-study-collection.store.spec.ts` | `jest.fn().mockReturnValue` infería `any[][]` para `mock.calls` | El doble `findOneAndUpdate` explicita entradas `unknown` y mantiene el mismo `makeQuery`/sesión, para validar filtros y opciones sin aceptar `any` |
| `study-collections/domain/study-collection.service.spec.ts` | 2 callbacks `async` sin `await` y cast redundante | Los mocks siguen retornando Promises y el store se inyecta estructuralmente, sin suprimir errores ni cambiar el servicio real |

## Validation gate

Workflow **B84 Export and Study fixture quality**:
- Checkout de `github.event.pull_request.head.sha` y verificación de HEAD exacto.
- Node fijado en `.nvmrc`, pnpm con `--frozen-lockfile`.
- Prettier `--check` de las cuatro pruebas.
- ESLint estricto `--max-warnings=0` de las cuatro pruebas.
- `pnpm --filter @losapuntes/api check:types`.
- Jest focal de esas cuatro suites.

No modificar `main` ni hacer merge si la CI global está roja. No alterar políticas de audit ni renovar la excepción node-forge vencida (#133), ni ocultar el advisory de braces (#141). La release #353 permanece **HOLD**; `STUDY_PROGRESS_ENABLED` apagado y `ACCOUNT_EXPORT_FORMAT_VERSION=1`.

El trabajo del PR #388 (`fix(lint): B83 strict study boundaries`) se mantiene independiente. El B84 propuesto es **carrier de tests**, no un reemplazo del ensamblado B83 ni del B82 nuevo de S3. Un integrador deberá reconciliar en `main` actual y volver a ejecutar gates sobre el SHA final.
