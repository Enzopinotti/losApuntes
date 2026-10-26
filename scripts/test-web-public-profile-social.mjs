import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { networkConnectionStatusLabel } from "../apps/web/src/features/community/network-presentation.ts";

const read = (p) => readFile(path.join(process.cwd(), p), "utf8");
const [page, actions, styles, profileContract, socialService] =
  await Promise.all([
    read("apps/web/src/pages/PublicProfile.tsx"),
    read("apps/web/src/features/community/public-profile-social-actions.tsx"),
    read("apps/web/src/pages/Profile.scss"),
    read("scripts/test-web-profile-contract.mjs"),
    read("apps/web/src/features/community/services/communityService.ts"),
  ]);

assert.match(page, /PublicProfileSocialActions/u);
assert.match(page, /status === "authenticated"/u);
assert.match(page, /status === "anonymous"/u);
assert.match(page, /profile\.about\?\.displayName && status/u);
assert.match(page, /viewerScopeKey=\{viewerScopeKey\}/u);
assert.match(page, /profileId=\{profile\.id\}/u);
assert.match(page, /profile\.professional\?\.headline/u);
assert.match(page, /profile\.about\?\.bio/u);
assert.match(page, /Ingresá para seguir o conectar/u);
assert.match(page, /<Link className="public-profile-signin" to="\/login">/u);
assert.match(page, /publicProfileActivityLink\(item\.url\)/u);
assert.match(
  page,
  /externalLink \? \([\s\S]*?className="public-activity-link"[\s\S]*?href=\{externalLink\.href\}[\s\S]*?rel="noopener noreferrer"[\s\S]*?target="_blank"/u,
);

// Pagination must preserve the accepted profile and keep retry local to activities.
assert.match(page, /loadMoreError: string \| null/u);
assert.match(page, /const loadMoreError = currentViewState\?\.loadMoreError/u);
assert.match(page, /if \(error\) \{/u);
assert.match(page, /\{loadMoreError && \(/u);
assert.match(page, /Reintentar actividades/u);
assert.match(page, /profileApi\.publicActivities\(/u);
assert.match(page, /const pagingRef = useRef/u);
assert.match(page, /pagingRef\.current\?\.scopeKey === profileScopeKey/u);
assert.match(page, /previous\?\.scopeKey === profileScopeKey/u);
assert.match(page, /isPaginationCurrent\(ticket\)/u);
assert.match(page, /appendActivities\(/u);
assert.doesNotMatch(page, /error:\s*"No pudimos cargar más actividades/u);

assert.match(actions, /communityApi\.follow\(profileId, ticket\.signal\)/u);
assert.match(actions, /communityApi\.unfollow\(profileId, ticket\.signal\)/u);
assert.match(actions, /communityApi\.requestConnection\(/u);
assert.match(actions, /result\.following !== true/u);
assert.match(actions, /connectionConfirmed: result\.connection/u);
assert.match(actions, /networkConnectionStatusLabel\(result\.connection\)/u);
assert.match(
  actions,
  /scopeKey = `\$\{viewerScopeKey\}:profile:\$\{profileId\}`/u,
);
assert.match(actions, /useAsyncAuthorityFence/u);
assert.match(actions, /inFlight\.current\?\.scopeKey === scopeKey/u);
assert.match(actions, /isCurrent\(ticket\)/u);
assert.match(actions, /role="status"/u);
assert.match(actions, /role="alert"/u);
assert.match(actions, /connectionPendingOrAccepted/u);
assert.match(actions, /Ir a mi Red/u);
assert.doesNotMatch(actions, /localStorage|sessionStorage/u);
assert.doesNotMatch(actions, /useEffect\(/u);
assert.doesNotMatch(actions, /setTimeout|setInterval/u);
assert.match(styles, /\.public-profile-social-actions/u);
assert.match(styles, /\.public-profile-social-help/u);
assert.match(styles, /\.public-activity-link:focus-visible/u);

assert.match(profileContract, /anonymous-readable/u);
assert.match(socialService, /credentials: "include"/u);
assert.match(
  socialService,
  /\/social\/profiles\/\$\{encodeURIComponent\(profileId\)\}\/follow/u,
);
assert.deepEqual(
  ["pending", "accepted", "declined", "disconnected"].map((status) =>
    networkConnectionStatusLabel({ status, incoming: false }),
  ),
  [
    "Solicitud enviada",
    "Conexión aceptada",
    "Solicitud rechazada",
    "Conexión finalizada",
  ],
);
console.log("PASS public profile social actions and activity error isolation");
