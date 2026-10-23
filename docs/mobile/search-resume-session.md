# Resume a recent Mobile search

Product requirement: MOB-FR-010.

The Home card **“Seguí tu búsqueda”** gives a signed-in user a direct way back
to the most recent valid Search input entered in the current app session. The
card does not display the query or subject. Selecting it opens Search through a
temporary route marker; the query and filter are not route parameters.
The card also offers an explicit action to discard the remembered query from
Home without changing saved resources.

The app keeps only the validated query, public search scope, and optional
canonical subject ID in process memory, keyed to the active user and session.
Search results, subject labels, credentials, and signed URLs are not copied
into this memory. Search input that becomes empty or invalid clears the entry.
Changing or ending the session clears it, and a process restart loses it.

When resumed, Search checks the session key, restores the input, removes the
temporary route marker, and requests fresh results using the current academic
context and access controls. A missing, malformed, or mismatched entry resets
the Search input instead of broadening the query. Existing share links retain
their separate, explicit behavior.

A newly mounted Search screen defers remembering its initially empty input
until a pending resume marker has been consumed. A session change clears the
old entry but does not overwrite a new explicit search link with the generic
input reset.

Local evidence for this block is the @losapuntes/mobile type check, its
targeted test suite, and formatting checks. These checks validate in-memory
session isolation, input validation, generic Home copy, the query-free route,
and marker cleanup. They do not replace a release build or manual device
accessibility review.
