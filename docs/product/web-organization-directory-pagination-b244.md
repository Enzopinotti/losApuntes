# Web organization directory pagination — B244

The Web organization directory now exposes the API's cursor pagination instead
of stopping after the first 25 results. “Cargar más organizaciones” appends the
next page while retaining the current name, type, and institution filters.

Each page request is tied to the active directory scope, including the signed-in
session and all filters. Changing scope invalidates the previous request. Page
results are deduplicated by organization ID, and a failed request keeps the
cursor available so the user can retry without reloading the first page.

The directory remains ordered and paginated by the existing API. This block does
not change server ordering, page size, API contracts, or Mobile behavior.
