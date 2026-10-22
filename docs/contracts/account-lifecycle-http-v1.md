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

## Study Collections persistence (B47)

When the persistent Study Collections feature is enabled, closing an account
also deletes **the owner's study_collections documents**, in the same MongoDB
transaction as the account status transition. This is a narrowly scoped private
data deletion, **not** a general hard deletion of all the user's content.
Concurrent collection creation locks the user's lifecycle revision in its own
transaction to prevent recreating a private collection after closure.

Existing asynchronous cleanup still revokes sessions and action tokens, and
may retry. A 202 response means the account is closed and its owned study
collections were deleted transactionally, but it does not claim all other
application datasets or backup retention have been erased.
