# Social + Q&A v1 — domain contract

**Slice:** 6  
**Status:** implementation contract  
**Date:** 2026-09-23

## Product outcome

Los Apuntes can connect people deliberately and support lightweight academic questions without treating shared academic context as social consent and without introducing hidden feed/recommendation ranking.

This slice closes four product capabilities together because their invariants interact:

- directional Follow;
- reciprocal Connection;
- academic Question / Answer;
- essential in-app notifications and reporting.

Feed / For You ranking remains Slice 7 / issue #11.

## Social invariants

### Follow

Follow is directional interest from one account to another Profile.

It does not:

- prove shared university/program/subject;
- grant access to hidden Profile sections;
- create a reciprocal Connection;
- grant Resource access;
- change recommendation consent.

Follow/unfollow is idempotent.

### Connection

Connection is reciprocal social consent.

Lifecycle:

`pending -> accepted | declined | disconnected`

A pending request identifies the requester and intended recipient. Only the intended recipient may accept or decline it. Either accepted participant may disconnect.

The unordered user pair is unique. Concurrent requests cannot create two parallel Connection objects.

Declined/disconnected pairs may be requested again; re-request creates a new pending state on the same stable relation identity.

### Academic proximity

Academic Graph may later explain discovery, but proximity never mutates social state.

No code in this slice auto-follows, auto-connects or exposes hidden academic affiliations.

## Q&A invariants

### Question

A Question has:

- stable UUID;
- author;
- canonical Subject;
- optional CourseOffering;
- title;
- body;
- state = `open | closed`;
- optional acceptedAnswerId;
- moderationState = `available | hidden`;
- optimistic revision;
- timestamps.

Questions are publicly readable while available. Creating or mutating requires an authenticated verified account.

### Answer

An Answer has:

- stable UUID;
- Question;
- author;
- body;
- moderationState = `available | hidden`;
- optimistic revision;
- timestamps.

Answers are independently moderatable.

Only the Question author may accept an Answer. The accepted answer must belong to that Question and be available.

Closing a Question prevents new Answers but does not hide historical content.

## Notifications

Notifications are product state, not logs.

V1 notification types:

- `social.followed`;
- `social.connection_requested`;
- `social.connection_accepted`;
- `qa.question_answered`;
- `qa.answer_accepted`.

A notification stores target user, optional actor, target object identity, type, readAt and timestamps.

Rules:

- no self-notifications;
- notification creation is atomic with the state transition that requires it;
- readers may only read/mark their own notifications;
- notification payload never becomes authorization for the linked object;
- deleting/hiding a target later may make navigation fail closed while preserving the notification record.

Push/email delivery is not claimed in v1.

## Reports

Questions and Answers support durable pending reports.

Report reasons:

- spam;
- plagiarism;
- harassment;
- misinformation;
- inappropriate;
- other.

One reporter has at most one pending report per target object. Repeated submission returns the same durable pending report rather than duplicating moderation work.

Resolution/appeals/admin moderation queue remain Pilot v1 (#8).

## Privacy / identity

Public social target identifiers are Profile UUIDs, never Mongo ObjectIds.

Server-side Profile resolution maps Profile UUID -> Account principal.

Attribution follows Profile visibility:

- public about section may show display name/avatar;
- otherwise attribution falls back to a generic Los Apuntes user label.

Social edges do not unlock private Profile sections.

## Persistence boundary

Application code depends on:

- `SocialStore`;
- `QaStore`;
- `NotificationStore`.

Mongo is the current adapter, not permanent domain architecture.

Sensitive multi-record transitions use a transactional unit-of-work so relation state and required notification cannot split.

## Explicit non-goals

Not in this slice:

- Feed / For You ranking;
- blocks/mutes;
- direct messaging;
- groups/organizations;
- push/email notification delivery;
- reputation points;
- likes/upvotes;
- comment threads beyond Answer;
- anonymous posting;
- moderation resolution/admin tools.

Those require separate product semantics rather than being smuggled into the social graph.

## Closure evidence

Before merge, exact-head CI must prove:

- Quality Gate;
- existing Auth/Academic/Profile/Files/Search critical gates;
- Social/Q&A critical coverage;
- production dependency audit;
- container runtime smoke including real Mongo transactions;
- follow idempotency;
- connection pair uniqueness + recipient-only accept/decline;
- academic proximity does not auto-connect;
- Q&A context validation;
- closed Question rejects new Answer;
- accepted Answer belongs to Question;
- notification ownership;
- report idempotency;
- hidden Question/Answer fail closed for ordinary reads.
