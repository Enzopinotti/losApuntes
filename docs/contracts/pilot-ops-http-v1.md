# Pilot Operations HTTP v1

## Authentication and permissions

### Authenticated product endpoints

Require an active Auth session.

### Pilot operator endpoints

Require:

- active Auth session;
- `pilot:ops:read`.

Moderation mutation additionally requires:

- `moderation:write`.

## GET /pilot/home

Authenticated.

Returns a bounded composition of already-authoritative domains:

```json
{
  "profileReady": true,
  "academic": {
    "currentContext": {},
    "currentSubjectIds": ["uuid"]
  },
  "academicFeed": {
    "items": [],
    "nextCursor": null,
    "stopReason": "end"
  },
  "forYou": {
    "items": [],
    "nextCursor": null,
    "stopReason": "end"
  },
  "notifications": {
    "unreadCount": 0
  }
}
```

The endpoint records one bounded `pilot.home_viewed` event for the authenticated user.

## Moderation queue

### GET /pilot/admin/moderation

Permission: `pilot:ops:read`.

Query:

- `status=pending|resolved|dismissed`, default `pending`;
- `limit` 1–100, default 50.

Returns a chronological unified queue over Resource, Question and Answer reports.

The queue includes report metadata and a bounded target preview required for operator review. It never returns file object keys, session data or private Profile fields.

### PATCH /pilot/admin/moderation/:kind/:reportId

Permissions:

- `pilot:ops:read`;
- `moderation:write`.

`kind` is `resource|qa`.

Body:

```json
{
  "action": "hide",
  "reason": "Verified policy violation"
}
```

Actions:

- `hide`;
- `restore`;
- `dismiss`.

Rules:

- only pending reports are reviewable;
- action is compare-and-set;
- hide/restore changes target moderation state atomically with report resolution + ModerationAction audit;
- dismiss resolves only the report;
- replay/concurrent review returns conflict;
- target/report disappearance fails closed.

## GET /pilot/admin/metrics

Permission: `pilot:ops:read`.

Query:

- `days` 1–90, default 14.

Returns:

- onboarding counts/rate;
- search/no-result counts/rate;
- active and returning users/rate;
- contribution events/contributors/rate;
- active Subject density rows;
- moderation backlog/resolution summary.

No raw search query text or content text is returned because Pilot telemetry never stores it.

## Telemetry integration

Telemetry is emitted by server-side product operations. There is no generic public arbitrary-event endpoint.

Server modules call the Pilot event sink with allowlisted event types and bounded dimensions.

## Web routes

- `/` remains the public landing route when anonymous and becomes contextual Home when authenticated.
- `/admin/pilot` is authenticated. Backend permission remains authoritative; the UI does not grant access by route visibility.

