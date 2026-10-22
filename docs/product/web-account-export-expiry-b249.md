# Web account export expiry feedback — B249

The Security export panel now uses one time-aware policy for both download-link
availability and its status message. When the server-provided download expiry
passes while the page remains open, the panel updates without waiting for a
manual refresh, hides the stale download link, and offers a new request.

This only improves the presentation of the existing feature-gated Web flow. It
does not change authentication, export endpoints, artifact contents, or the
production readiness gate tracked by issue #315.
