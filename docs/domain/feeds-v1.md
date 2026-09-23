# Feeds v1 — domain and ranking contract

**Issue:** #11  
**Status:** implementation contract  
**Date:** 2026-09-23

## Product outcome

Los Apuntes provides two bounded feeds that help a student study, discover useful knowledge and stay connected without optimizing compulsive attention.

Feeds are a projection over existing authorities. They do not own Resources, Questions, Profiles, social relationships or Academic Graph state.

## Feed surfaces

### Academic

A predictable knowledge feed driven only by the user's current canonical Subject participations.

Candidate types in v1:

- Resource;
- Question.

Ordering is chronological by candidate creation time with deterministic tie-breaking.

Academic feed does not use popularity, implicit engagement, interests or social relationships to reorder items.

If the user has no current Subject participation, the feed returns an explicit empty state. It does not guess a university, career or subject.

### For You

A transparent recommendation feed over Resources and Questions.

Candidate generation can use:

- current canonical Subjects, only when academic recommendation consent is enabled;
- explicitly prioritized Subjects;
- followed and accepted-connection authors, only when social feed signals are enabled;
- the user's own skills/interests/help/learning topics, only when the corresponding Profile recommendation signals and Feed preferences allow them;
- a bounded exploration pool of currently eligible content.

People discovery remains on Search/Network in v1. Opportunities are not a feed candidate until an Opportunity domain exists.

## Eligibility before scoring

A candidate must pass its source-domain authorization and moderation rules before ranking.

Feed never weakens:

- Resource private/shared/public authorization;
- Resource moderation availability;
- Question moderation availability;
- Profile attribution privacy;
- Academic canonicalization.

Knowing a Feed item id or explanation never grants access to its source object.

Muted Subjects and muted Profiles are removed before scoring.

The viewer's own content is excluded from For You and Academic discovery.

## Ranking objective

For You does **not** optimize watch time, endless sessions, raw clicks or CTR.

V1 uses a deterministic, inspectable utility score from signals the product can currently prove:

- academic relevance;
- explicit prioritized-Subject relevance;
- accepted-connection / followed-author relevance;
- explicit interest/topic text match;
- freshness;
- unanswered-Question / unmet-need bonus;
- explicit per-item more/less feedback;
- bounded exploration.

No popularity, reputation or quality score is invented where the product has no trustworthy authority.

### Modes

Supported:

- `balanced` — default mixed utility;
- `study` — strengthens academic relevance and unanswered Questions;
- `discover` — strengthens interest match and exploration;
- `community` — strengthens explicit social relations.

`opportunities` is deliberately unsupported until an Opportunity domain exists.

### Non-personalized option

For You supports `order=chronological`.

Chronological mode keeps privacy/moderation/mutes but does not apply personalized utility weights. It orders the bounded eligible pool by creation time.

## Explanations

Every ranked item returns one or more stable reason codes when applicable:

- `current_subject`;
- `prioritized_subject`;
- `connection`;
- `following`;
- `interest_match`;
- `unanswered_question`;
- `fresh`;
- `explicit_more`;
- `exploration`.

Explanations are descriptive. They are not authorization and do not expose hidden Profile or Academic data.

## User controls

Per-user FeedPreferences:

- useAcademic;
- useSocial;
- useInterests;
- mutedSubjectIds;
- mutedProfileIds;
- prioritizedSubjectIds;
- revision.

Profile `recommendationSignals` are an upper-level consent boundary. A Feed preference cannot re-enable a Profile recommendation signal the user disabled.

Subject ids are canonicalized through Academic Graph. Profile ids are validated against Profile authority.

Preferences use optimistic concurrency.

Per-item explicit feedback:

- `more`;
- `less`;
- clear feedback.

Feedback is unique per user + target. Recording/clearing feedback increments the Feed state revision, invalidating older cursors.

## Diversity rerank

For You reranks the scored list with hard page-level concentration caps:

- maximum 2 items from one author;
- maximum 4 items from one Subject;
- when both Resources and Questions are available, the first pass prevents one type from exceeding 70% of the requested page.

A second bounded fill pass may relax only the type-mix cap when needed. Author and Subject caps remain hard.

Academic feed keeps deterministic chronology but caps one author to 3 items per page.

## Healthy-use guard

Feed pagination is deliberately finite.

A cursor freezes:

- anchor timestamp;
- feed state revision;
- mode/order;
- page number;
- offset.

One feed session permits at most **3 pages** and at most **25 items per page**. After the third page, `nextCursor` is null and `stopReason = natural_break` even if more eligible content exists.

This is intentional product behavior, not an API limitation to bypass with an alternate endpoint.

## Determinism and freshness

Candidates are bounded to `createdAt <= anchorAt`.

Tie-breaking is stable by:

1. utility score descending for ranked For You;
2. createdAt descending;
3. candidate type;
4. candidate id.

Academic and chronological ordering use createdAt descending, then type/id.

Changing preferences or explicit feedback increments Feed state revision. A cursor created under another revision fails with `FEED_CURSOR_STALE` so clients refresh instead of silently mixing ranking states.

## Metrics boundary

V1 may record explicit feedback and feed-request diagnostics, but ranking does not consume:

- session duration;
- scroll depth;
- watch time;
- CTR;
- streaks;
- popularity counts.

Future evaluation may measure utility/diversity/concentration/ecosystem coverage, but extremely long sessions are a health signal rather than a success target.

## Persistence boundary

`FeedStore` owns only Feed preferences and explicit feedback.

Candidate source domains keep their own persistence and expose bounded internal candidate queries through their services/stores.

This prevents Feed from becoming a second Resource/Q&A/Social/Profile database.

## Explicit non-goals

- infinite scroll;
- ads/sponsored ranking;
- Opportunity cards before Opportunity domain;
- institution announcements before institution-content authority;
- likes/upvotes/reputation;
- blocks/mutes beyond feed-specific Subject/Profile mutes;
- machine-learning ranking;
- collaborative filtering;
- notification ranking;
- hidden behavioral profiling.

These require independent semantics and evidence rather than being smuggled into v1.
