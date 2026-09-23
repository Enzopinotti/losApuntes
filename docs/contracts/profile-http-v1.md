# Profile HTTP contract v1

Base paths:

- owner: `/profile/me`
- public: `/profiles/:profileId`

All owner writes/reads require the existing revocable AuthSession authority.

## GET /profile/me

Returns either:

```json
{
  "profile": null,
  "onboardingRequired": true
}
```

or the full owner projection:

```json
{
  "profile": {
    "id": "uuid",
    "displayName": "Nombre",
    "bio": "optional",
    "avatarUrl": "https://...",
    "languages": ["es"],
    "skills": ["SQL"],
    "interests": ["datos"],
    "helpTopics": ["bases de datos"],
    "learningTopics": ["sistemas distribuidos"],
    "professional": {
      "headline": "optional",
      "careerDiscoveryOptIn": false
    },
    "presentation": {
      "accentPreset": "default",
      "coverPreset": "none",
      "sectionOrder": ["about", "academic", "learning", "activities", "skills", "professional", "contributions"]
    },
    "visibility": {
      "about": "public",
      "academic": "private",
      "learning": "private",
      "activities": "private",
      "skills": "private",
      "professional": "private",
      "contributions": "private"
    },
    "recommendationSignals": {
      "academicContext": true,
      "learning": true,
      "skillsInterests": true
    },
    "revision": 1
  },
  "academic": {
    "affiliations": [],
    "participations": [],
    "currentContext": null
  },
  "activities": [],
  "contributions": {
    "available": false,
    "items": []
  },
  "onboardingRequired": false
}
```

Academic data is composed from Academic Graph and is not stored in Profile.

## POST /profile/me

Creates the owner's profile.

Minimum body:

```json
{
  "displayName": "Nombre"
}
```

Optional bounded fields can initialize bio/avatar/languages/skills/interests/help/learning/presentation/privacy/recommendation/professional settings.

If a profile already exists:

- HTTP 409;
- `PROFILE_ALREADY_EXISTS`.

## PATCH /profile/me

Requires:

```json
{
  "expectedRevision": 1,
  "...": "changed fields only"
}
```

Stale writes fail:

- HTTP 409;
- `PROFILE_REVISION_CONFLICT`.

The API does not accept academic affiliation/program/subject fields here.

## Activity endpoints

### POST /profile/me/activities

Creates one activity owned by the current user.

Supported types:

- `project`;
- `research`;
- `club`;
- `volunteering`;
- `academic_work`.

Fields are bounded title, optional description, optional HTTPS URL and optional coarse `YYYY` or `YYYY-MM` start/end periods.

### PATCH /profile/me/activities/:id

Requires `expectedRevision` and updates only the acting user's activity.

### DELETE /profile/me/activities/:id?expectedRevision=N

Deletes only the acting user's activity when the revision matches.

Unknown/cross-user IDs return the same not-found contract.

## GET /profiles/:profileId

Anonymous/public projection.

Only sections whose policy is exactly `public` are emitted.

Important:

- `university` does not currently fall back to public;
- `connections` does not currently fall back to public;
- professional discoverability opt-in is never inferred from section visibility;
- email/userId/security state are never returned.

If `academic` is public, the response composes academic state from Academic Graph.

## Public privacy behavior

A public response always includes the stable profile ID and revision metadata needed for cache/update semantics, but section payloads are omitted unless visible.

The API must not leak a private section through:

- a derived label;
- counts;
- section-order entries;
- recommendation settings;
- legacy User fields;
- error differences.

## Stable errors

- `AUTHENTICATION_REQUIRED`;
- `ACCOUNT_RESTRICTED`;
- `PROFILE_NOT_FOUND`;
- `PROFILE_ALREADY_EXISTS`;
- `PROFILE_REVISION_CONFLICT`;
- `PROFILE_ACTIVITY_NOT_FOUND`;
- `PROFILE_ACTIVITY_REVISION_CONFLICT`;
- `PROFILE_ACTIVITY_PERIOD_INVALID`.

Activity periods use coarse `YYYY` / `YYYY-MM` values. When both ends exist, the end period cannot be earlier than the start period.

Validation errors use the repository-wide request-ID/error envelope.

## Client rules

The Web implementation consumes this contract through cookie-authenticated, `no-store` requests. It does not persist or reconstruct an auth bearer in browser storage.

Clients must not:

- write university/career/year into Profile;
- infer university/community access from a self-asserted profile field;
- expose recommendation flags as public-profile privacy;
- assume connections visibility is currently resolvable;
- derive authorization from a profile UUID;
- use email as public profile identity;
- treat contribution projection as editable profile state.
