# Web async authority fencing

**Canonical issue:** #101  
**Reference implementation:** `apps/web/src/shared/useAsyncAuthorityFence.ts`

## Why

A request may start while the browser is showing authority/context A and resolve
after the user has moved to B. Cancellation reduces wasted work, but it is not a
commit-authority check: a response can race with a context/session switch.

UI state may be mutated only when the async operation can still prove that it
belongs to the current principal and view scope.

## Required pattern

For a sensitive surface:

1. Build a bounded, non-secret `scopeKey`.
2. Include the current Auth principal/session when private data is involved.
3. Include view/filter/context identity when changing it makes old data stale.
4. Call `begin()` immediately before starting the request.
5. Pass `ticket.signal` to the transport.
6. Check `isCurrent(ticket)` before every success/error mutation.
7. Use `finish(ticket)` before clearing loading/busy state.
8. Let a newer operation invalidate/abort the older one.

Example shape:

```tsx
const authorityScope = [
  status,
  user?.id ?? "anonymous",
  session?.id ?? "no-session",
  selectedSubjectId ?? "all",
].join(":");

const {
  begin,
  isCurrent,
  finish,
} = useAsyncAuthorityFence(authorityScope);

const load = async () => {
  const ticket = begin();
  setLoading(true);

  try {
    const result = await api.load(ticket.signal);
    if (!isCurrent(ticket)) return;
    setResult(result);
  } catch (error) {
    if (!isCurrent(ticket)) return;
    setError(messageFor(error));
  } finally {
    if (finish(ticket)) setLoading(false);
  }
};
```

## Scope rules

Use identifiers/generations, never secrets:

- Auth status;
- user id;
- session id;
- academic node ids;
- feed/search mode;
- resource/view id;
- local operation identity where required.

Do not put cookies, bearer tokens, email addresses, signed URLs or raw user
content into a scope key.

## Why the epoch exists in addition to the scope string

A user can move A -> B -> A while an old A request is still running. Comparing
only a string scope would accept that old completion after returning to A.

The hook increments a monotonic epoch on each scope transition/operation, so an
old A ticket cannot regain authority merely because the textual scope looks the
same again.

## Success, error and finally are all scoped

Fencing only successful data writes is insufficient. A stale operation must not:

- replace current results;
- clear a newer error;
- report an error for the wrong principal/context;
- release another request's `loading`/`busy` guard;
- append a page to a different feed/filter;
- resurrect protected data after logout/login.

## Fence lifecycle and React Strict Mode

The canonical fence is reusable across React Strict Mode effect replay but must
reject work after a real unmount:

- effect setup calls `resume()`;
- cleanup calls `suspend()`, which invalidates the epoch and aborts the current
  controller immediately;
- a replayed setup may resume the same fence;
- callbacks that run after a real unmount receive an already-aborted ticket and
  cannot acquire presentation ownership;
- `dispose()` remains terminal for the pure primitive and is covered by the
  deterministic regression contract.

This lifecycle is tested together with the A -> B -> A invariant so an old
ticket cannot regain authority after either a scope round-trip or an effect
replay.

## Transport contract

Transports that participate in this pattern accept an optional
`AbortSignal` from the caller and combine it with their bounded request
timeout. Caller cancellation is not reported as proof of logout/revocation.

## Current covered surfaces

The current Web inventory is:

- Auth restore/login/logout and cross-tab authority convergence through its own
  generation fencing;
- Search explicit results and contextual discovery;
- Feeds: academic/for-you loads, pagination, preferences and feedback;
- Resources: list/detail/filter/pagination and mutations;
- Organizations: directory, public detail, pagination and management actions;
- AcademicLifecycle: lifecycle snapshot, affiliations, catalog search and
  mutations;
- Network: following/connections lists, pagination, people search and
  relationship actions;
- Profile: owner snapshot/actions/activity pagination plus public profile route
  and public activity pagination;
- Notifications: list reconciliation and notification actions;
- Security: session/login-method/Google-status loads and security mutations;
- Pilot Home: personalized home snapshot by authenticated principal/session;
- AdminPilot: metrics/moderation load by principal/session/window and review
  actions by principal/session.

Questions/Q&A is the remaining #101 surface until its list/detail/subject-search,
answer pagination and mutation completions are integrated on the same authority
model.

Public auth-action pages such as password recovery/email verification are
token/email workflows rather than authenticated principal snapshots; they are
classified separately and are not treated as substitutes for the session/view
fence above.

## New feature checklist

Before adding a new async private Web flow, answer:

- What principal/session owns this response?
- What academic/resource/view scope owns it?
- Can another operation start before this one settles?
- Can a stale error/finally mutate current presentation?
- Does the transport accept caller cancellation?
- Is there a deterministic regression contract/test?

Avoid page-global `let active = true` flags or a single boolean shared across
different operations. They do not encode which operation owns the state.

A mount-only boolean used for non-principal provider capability/config fetches
is not equivalent to authority fencing and must not be copied into private or
viewer-sensitive flows.
