# Web study collection recovery list pagination

The collection selector on the recovery page tracks list cursors within the current viewer session. It stops a repeated or earlier cursor while keeping already loaded collections visible and offers a refresh from the first page.

Transient page failures keep the existing items and cursor available for retry. Expired sessions, revoked access, missing collections, and disabled synchronized collections clear the list. The health scan and conditional reference-removal flow keep their own cursor and revision checks.
