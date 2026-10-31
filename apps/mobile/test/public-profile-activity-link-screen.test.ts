import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const profile = readFileSync(
  new URL("../src/features/search/search-result-screens.tsx", import.meta.url),
  "utf8",
);
const activities = readFileSync(
  new URL(
    "../src/features/search/public-profile-activities.tsx",
    import.meta.url,
  ),
  "utf8",
);
const action = readFileSync(
  new URL(
    "../src/features/search/public-profile-activity-link.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("public activity URLs are server-projected", () => {
  assert.ok(activities.includes("value={activity.url}"));
  assert.ok(activities.includes("title={activity.title}"));
  assert.ok(activities.includes("key={`"));
  assert.ok(activities.includes("PublicProfileActivityLink"));
  assert.ok(profile.includes("PublicProfileActivities"));
  assert.ok(profile.includes("PublicProfileAvatar"));
  assert.ok(profile.includes("SharePublicProfileAction"));
  assert.ok(profile.includes("Intereses:"));
  assert.ok(profile.includes("Idiomas:"));
});

test("external opening is user-initiated, accessible and guarded", () => {
  assert.ok(action.includes("publicProfileActivityExternalUrl(value)"));
  assert.ok(action.includes("Linking.openURL(url)"));
  assert.ok(action.includes('accessibilityRole="link"'));
  assert.ok(action.includes('accessibilityRole="alert"'));
  assert.ok(action.includes("openingRef.current"));
  assert.ok(action.includes("mountedRef.current"));
  assert.ok(action.includes("externalHost"));
  assert.ok(action.includes("minHeight: 44"));
  assert.ok(!action.includes("fetch(url)"));
});
