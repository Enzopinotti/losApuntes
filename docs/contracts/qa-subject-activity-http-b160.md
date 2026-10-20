# B160 — Private Q&A activity breakdown by subject

## Why this endpoint exists

Students need to see **which subjects they are actively helping with and
asking about** without downloading their entire question/answer histories.
This v1 endpoint supports Profile/Study dashboards and deliberately
complements B145 "My Questions", B146 "My Answers" and B159 global activity
summary. It does not implement public rankings, reputational scoring,
attendance, enrollment inference or a leaderboard.

Canonical boundaries: Q&A available/hidden moderation, accepted answers,
session owner isolation, no-store private summaries and bounded client
payloads. No changes to existing auth, source Q&A controllers, database
schemas, lockfiles or frontend/mobile.

## GET /qa/me/subject-activity

- Requires authenticated, revocable `AuthSessionGuard`.
- Owner determined **only** by `request.user.id`, not request query/body.
- No input parameters in v1; `Cache-Control: private, no-store`.
- HTTP 200 (illustrative values):

    {
      "items": [
        {
          "subjectId": "subject-uuid",
          "questionsTotal": 3,
          "questionsOpen": 1,
          "questionsClosed": 2,
          "answersVisible": 4,
          "answersAccepted": 1,
          "totalActivity": 7
        }
      ],
      "hasMore": false
    }

A new account returns `{"items":[],"hasMore":false}`.

Definitions:
- `questionsOpen` and `questionsClosed`: caller-authored **available**
  questions with those states for this `subjectId`.
- `questionsTotal = questionsOpen + questionsClosed`.
- `answersVisible`: caller-authored **available** answers where the original
  question is also **available**, attributed to that question's `subjectId`.
  This includes replies to questions by other authors (no leaked author IDs).
- `answersAccepted`: subset with `Answer.id = Question.acceptedAnswerId`.
  Not added again to activity totals.
- `totalActivity = questionsTotal + answersVisible`: contribution count,
  not a correctness/reputation/learning-outcome score.
- Sorted `totalActivity DESC, subjectId ASC`. Maximum 20 subjects with
  `hasMore=true` when a 21st subject exists. This is **a top-20 summary**,
  not an exhaustive listing/pagination API; later pages are not supported.

## Mongo and visibility

One server-side pipeline on `questions` with an `$unionWith` branch on
`answers`. Both sources filter `authorUserId` from session and
`moderationState=available`. Answers join `questions.id` (existing unique
index) and discard hidden/missing parent questions **before** grouping.
The final group merges question and answer contributions **before** sorting
and limiting; independently limiting each branch would produce wrong top
subjects. Output only a 21-row window, no raw document content or other
students' identities. Uses a 5-second Mongo server-side max-time bound.

Existing indexes on owner and unique question ID are reused; no writes,
data migration, new index or schema mutation. Snapshot is eventually
consistent across in-flight Q&A updates. Counts and visibility can change
on refresh. Mongo failure is never converted to synthetic empty activity.

Invalid or duplicate aggregate rows, non-integer/negative/impossible counts
or more than 21 rows fail closed with HTTP 503
`QA_SUBJECT_ACTIVITY_UNAVAILABLE`.

## Frontend integration and release

- Show per-subject activity only to the account owner.
- Resolve display labels using existing authorized academic endpoints; this
  contract only includes subject IDs, no extra student/subject metadata.
- Empty: nonjudgmental prompt to explore Q&A; not interpreted as lack of
  academic progress.
- Tests assert session guard, owner-only Mongo filters, parent question
  moderation, exact merged grouping/sorting, limit and overflow, corruption,
  503 behavior and source failures.
- Release requires strict CI, coverage, runtime smoke and **passed**
  high/critical production dependency audit. Known security issues #133
  and #141 and release #353 remain HOLD; never bypass these gates.
