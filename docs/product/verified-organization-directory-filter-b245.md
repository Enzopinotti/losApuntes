# Organization verification directory filter — B245

Web and Mobile can filter the organization directory by all, verified, or
unverified status. The selected state is sent to the existing search endpoint,
where request validation and the Mongo query apply it before cursor pagination.

The filter is part of each directory's authority scope, so changing status
discards stale results and starts a new first page. Pagination retains the
verification state together with name, type, and institution filters.

Verification describes a reviewed claim and does not imply endorsement by Los
Apuntes.
