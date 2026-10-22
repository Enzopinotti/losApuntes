# Mobile study agenda (B199)

Authenticated Mobile users can view saved study sessions in two sections:
scheduled sessions, ordered by their saved local wall-clock value, and
unscheduled sessions. Each row displays the plan title, saved time when
present, task counts, and remaining minutes. The screen can open the existing
focus timer but does not create reminders or mutate a plan.

The view reads only `GET /study-progress/me/agenda`. The server derives the
owner from the revocable session and returns a bounded summary without task
contents, resource identifiers, or private links. Mobile keeps the response in
memory, aborts and fences late responses when the screen loses focus or the
session changes, and never converts `startsAt` from a saved local wall clock to
a UTC instant.

Discoverability is gated by `EXPO_PUBLIC_STUDY_AGENDA_ENABLED`, false by
default. This client flag does not enable the API: `STUDY_PROGRESS_ENABLED`
remains the independent server authority. The agenda is read-only and does not
change study-plan storage, export, or lifecycle behavior.
