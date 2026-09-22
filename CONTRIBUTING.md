# Contributing

## Working method

1. Reconcile the issue/handoff against GitHub remote before editing.
2. Work on a focused branch tied to an issue.
3. Keep commits reviewable and single-purpose.
4. Never merge historical branches wholesale.
5. Run the repository verification suite before requesting merge.
6. Treat green CI as necessary, not sufficient: validate the product behavior affected by the change.

## Architectural changes

Create or update an ADR when a change commits the project to a long-lived technical decision such as persistence, authentication/session transport, storage, search or client contract strategy.

## Security

Never commit credentials or real secrets. Use `.env.example` placeholders only. If a secret is ever committed, removing the file is not sufficient; rotate/revoke the credential.
