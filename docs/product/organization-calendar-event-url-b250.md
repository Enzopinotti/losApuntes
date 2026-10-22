# Event links in organization calendar files — B250

When a scheduled organization event has a valid HTTPS external link, the shared
iCalendar serializer now includes it as the standard `URL` event property. The
link remains in `DESCRIPTION` for existing calendar clients. Malformed URLs,
non-HTTPS schemes, embedded credentials, control characters, and values beyond
the API's 2048-character limit are omitted from both properties.

The property follows [RFC 5545 section 3.8.4.6](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.4.6). The serializer continues to fold lines at the existing 75-octet limit; no calendar permission, event visibility, or API behavior changes.
