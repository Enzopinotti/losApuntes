# Mobile organization content reports — B246

Mobile users can report public organization Posts and Events from their detail
cards. The report form uses the server's moderation reasons and detail limits,
requires an explicit submit, and identifies whether the target is a Post or an
Event.

Every report is bound to the active session, organization, and content ID. A
confirmed response records the report as pending review. If a timeout, network
failure, or server error leaves the result ambiguous, the action blocks another
submission so the client does not knowingly create a duplicate.

The implementation uses the existing report endpoints and does not grant
organization managers additional moderation authority.
