# Account lifecycle HTTP v1

Parent: #82

All routes require a current active AuthSession and inherit API no-store policy.

## GET /account/closure/preflight

Returns reauthentication as password or unsupported, a bounded managementBlockers array, managementBlockersTruncated, and managementBlockerLimit = 20.

The list is advisory UX only. Server authority rechecks blockers in the closure transaction.

## POST /account/closure

Password-backed body contains currentPassword.

Success is HTTP 202 and returns accepted = true plus an opaque durable cleanupJobId.

Stable errors:
- ACCOUNT_CLOSURE_REAUTHENTICATION_FAILED
- ACCOUNT_CLOSURE_REAUTHENTICATION_UNAVAILABLE
- ACCOUNT_CLOSURE_MANAGEMENT_BLOCKED
- ACCOUNT_CLOSURE_CONFLICT

Web success clears the session cookie. Mobile must clear its opaque session credential after 202. A stale credential remains unusable even if the client fails to clear it.

HTTP 202 means account authority is already closed; it does not mean asynchronous cleanup or future legal deletion is complete.
