# Campus Organizations v1

**Issue:** #13  
**Status:** In implementation  
**Authority:** Domain Contract 2026 + current Social/Feeds/Pilot contracts

## 1. Mission

Represent real campus/community organizations as first-class actors without confusing them with:

- canonical academic Institution nodes;
- personal Profiles;
- ad-hoc Groups;
- platform administrators.

Examples include student centers, associations, clubs, labs, research groups, alumni associations, incubators, cultural/sports groups and career communities.

## 2. Identity and scope

Organization has a stable product UUID and an explicit organization type.

Organization is not an Academic Graph node.

Academic scope may include:

- one required Institution;
- optional Campus;
- optional Academic Unit / Faculty;
- optional Program / Career.

Every scope ID is canonicalized through Academic Graph redirects and must belong to the same Institution.

Renaming/merging catalog nodes must not break organization identity.

## 3. Claim and verification

Organization state is split:

- `claimState = claimed | unclaimed`;
- `verificationState = unverified | verified`.

These facts are separate.

A verified user may create an organization and becomes its initial owner manager. That proves account control of the page, not external institutional endorsement.

In v1, user-created organizations always begin as `claimed`. The `unclaimed` state is reserved for a future authoritative import/curation workflow; v1 does **not** claim to implement creation of unclaimed pages, claim requests or claim transfer. Those flows require their own evidence, abuse controls and audit contract before activation.

Only an explicit platform permission may change `verificationState`.

Verification confirms identity evidence reviewed by Los Apuntes. It does not imply endorsement, ideological alignment, sponsorship or quality ranking.

## 4. Management authority

Managers are explicit relationships:

- `owner`;
- `admin`;
- `editor`.

Capabilities:

| Capability | owner | admin | editor |
| --- | --- | --- | --- |
| Edit organization profile | yes | yes | no |
| Publish/edit/remove posts | yes | yes | yes |
| Publish/edit/cancel events | yes | yes | yes |
| Manage useful links/resources | yes | yes | yes |
| Add/revoke managers | yes | yes* | no |
| Transfer/revoke final owner | guarded | no | no |
| Change verification | no | no | no |

`admin` cannot create/revoke an `owner`.

At least one owner must remain.

Role mutations use expected revision / conditional persistence and append an immutable management audit event with actor, target, previous role, next role, reason and timestamp.

Scalar `User.role` never grants organization management.

## 5. Followers

Organization follow is a unique `userId + organizationId` relation.

Following is explicit user choice.

Academic membership, institution affiliation or geographic proximity never auto-follow an organization.

Unfollow removes future organization-follow relevance immediately.

## 6. Posts and source clarity

OrganizationPost belongs to exactly one Organization and records the manager user who authored the action.

Public projections always include:

```json
{
  "source": {
    "kind": "campus_organization",
    "organization": {
      "id": "uuid",
      "name": "Centro ...",
      "verificationState": "verified"
    }
  }
}
```

The posting manager's private account/profile is not exposed as the content source.

Organization posts have:

- stable UUID;
- body;
- optional title;
- optional canonical Subject;
- moderation state;
- revision;
- publishedAt / updatedAt.

Posts are readable while the Organization is active and the post is not hidden.

## 7. Events

OrganizationEvent belongs to one Organization.

Fields include:

- title;
- description;
- startAt;
- optional endAt;
- optional location label;
- optional external URL;
- state = scheduled | cancelled;
- revision.

`endAt < startAt` is rejected.

Events are product content, not calendar invitations in v1.

## 8. Useful links and Resources

Managers may curate:

- external HTTPS links;
- existing Resources.

Resource curation is a relationship only. It does not transfer ownership or access.

The public Organization projection reauthorizes every featured Resource at read time. A Resource that becomes inaccessible/hidden/private no longer resolves publicly from the page.

## 9. Feed eligibility

Organization content does not enter a user's feed merely because they belong to the same university.

OrganizationPost candidates enter For You only when the viewer explicitly follows the Organization.

The feed reason is `organization_following`.

Organization posts do not gain conflict/controversy engagement bonuses.

Existing healthy caps/freshness/natural breaks remain authoritative.

Academic Feed remains current-subject study content and does not automatically inject organization posts.

## 10. Search/discovery

V1 exposes bounded Organization discovery by:

- name query;
- organization type;
- Institution;
- optional Program.

It does not replace canonical Academic Catalog search.

## 11. Moderation

Organization Posts and Events remain source-attributed and reportable.

The existing platform moderation authority remains separate from organization management.

Managers cannot use organization roles to bypass moderation.

Electoral/campaign-specific student product behavior is explicitly outside this module.

## 12. Web surface

Web v1 includes:

- Organization directory;
- public Organization page;
- follow/unfollow;
- posts/events/useful links/resources;
- manager surface for authorized users;
- manager role controls for owner/admin;
- verification badge/state with neutral wording.

The browser uses existing HttpOnly-cookie auth and no bearer storage.

## 13. Acceptance evidence

Before merge, exact-head CI must prove:

- Organization service critical coverage;
- organization-management negative authorization;
- final-owner protection;
- verification permission separation;
- academic scope canonicalization;
- follow idempotency;
- post/event lifecycle;
- public source attribution;
- explicit-follow feed eligibility;
- unfollow removes future feed eligibility;
- featured Resource reauthorization;
- manager audit durability;
- Web transport/static contract;
- full container runtime smoke.

Post-merge `main` must pass the same gates.
