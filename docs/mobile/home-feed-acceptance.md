# Mobile Home feed acceptance

Home keeps one active feed intent at a time. The academic/community and For You
feeds retain independent cursor state and scroll offsets. The server remains the
authority for content, ordering, cursor validity, and the three-page natural
break.

## Rendering and pagination

- The active feed renders in a `FlatList`; its stable item key is `type:id`.
- The Home heading, academic context, notification entry, intent selector, and
  active feed heading are in the list header. Feed cards are virtualized list
  rows, so Home does not nest a list inside `ProductSurface`'s `ScrollView`.
- `onEndReached` and measured distance from the viewport end may request the
  next page. The controller deduplicates concurrent requests, checks current
  session/context authority, and appends only unseen items.
- A page remains automatic during normal reading. Network errors expose a
  manual retry; invalid or stale cursors require refreshing Home.
- The client stops when the cursor is absent, the server returns
  `natural_break`, or the client reaches its bounded 48-item window. It never
  creates or decodes a cursor.
- At `natural_break`, the user can switch intent or explicitly request a new
  Home snapshot. That action resets the list position and calls the snapshot
  endpoint; it does not continue the previous cursor.
- Switching intent remounts the list with that feed's saved offset. A session or
  academic-context authority change clears both feed offsets and returns to the
  first intent.

## Device acceptance still required

Source and automated checks do not replace a physical-device pass. On iOS and
Android, verify pull-to-refresh, VoiceOver/TalkBack focus across appended rows,
stable reading position while a page arrives, feed switching/restoration, and
the natural-break action. No physical-device validation is claimed by the
source-level checks.
