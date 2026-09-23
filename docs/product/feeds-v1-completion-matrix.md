# Feeds v1 — completion matrix

| Capability | Required evidence |
| --- | --- |
| Academic feed uses only current canonical Subjects | unit + runtime |
| Academic feed is deterministic chronological | unit + runtime |
| No inferred academic context when none exists | negative unit + runtime |
| For You candidate generation uses existing domain authorities | architecture + unit |
| Source privacy/moderation enforced before ranking | negative unit + runtime |
| Profile recommendation consent cannot be overridden by Feed preference | unit + runtime |
| Explicit prioritized Subject | unit + runtime |
| Social followed/connection relevance | unit + runtime |
| Interest/topic relevance | unit |
| Unanswered Question unmet-need boost | unit + runtime |
| More/less explicit feedback | unit + runtime |
| Chronological non-personalized mode | unit + runtime |
| Stable why/explanation codes | unit + Web contract + runtime |
| Muted Subject/Profile exclusion | negative unit + runtime |
| Author concentration cap | unit + runtime |
| Subject concentration cap | unit + runtime |
| Resource/Question type diversity when supply exists | unit |
| Max 25 items/page | validation + runtime |
| Three-page natural stop | unit + runtime |
| Cursor anchor + state revision | unit |
| Preference/feedback change makes old cursor stale | unit + runtime |
| No CTR/watch-time/popularity signal in ranking contract | static contract |
| Web feed surface + controls | build + static contract |
| Dedicated Feed coverage gate | CI |
| Container lifecycle smoke | CI |
| Exact-head candidate green | PR evidence |
| Post-merge main green | closure evidence |

## Honest boundary

Feeds v1 ranks Resources and Questions only.

People remain discoverable through Search/Network. Opportunities and institutional announcements are not emitted until their own authoritative domains exist. No ML/collaborative filtering, popularity score, ad ranking or behavioral-attention optimization is claimed.
