# Mobile organization event calendar export — B248

Mobile users can share a scheduled organization event as an iCalendar `.ics`
file from its event card. The file carries the event's UTC start and end, title,
description, location, and external URL, using the same validated serializer as
Web.

The native share sheet lets the user choose a calendar or another compatible
app. Cancelled or malformed events cannot be exported, no calendar permission
is requested, and the temporary cache file is removed after the share sheet
closes.
