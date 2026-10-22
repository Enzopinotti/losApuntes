import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Home links to a private, voluntary focus clock", () => {
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../src/app/study-focus.tsx", import.meta.url),
    "utf8",
  );
  const screen = readFileSync(
    new URL("../src/features/study/focus-clock-screen.tsx", import.meta.url),
    "utf8",
  );

  assert.match(home, /router\.push\("\/study-focus"\)/u);
  assert.match(home, /Abrir temporizador de estudio/u);
  assert.match(route, /Redirect href="\/sign-in"/u);
  assert.match(route, /studyFocusMinutesFromParam\(minutes\)/u);
  assert.match(route, /key=\{`\$\{authorityKey\}:\$\{suggestedMinutes\}`\}/u);
  assert.match(screen, /useIsFocused/u);
  assert.match(screen, /AppState\.addEventListener\("change"/u);
  assert.match(screen, /AccessibilityInfo\.announceForAccessibility/u);
  assert.match(screen, /accessibilityLiveRegion="none"/u);
  assert.match(screen, /No registramos ni sincronizamos el tiempo/u);
  assert.match(screen, /clock\.durationMs \/ 60_000/u);
  assert.doesNotMatch(
    screen,
    /fetch\(|axios|AsyncStorage|SecureStore|localStorage|Notification|Audio\(/u,
  );
});

test("focus navigation is visible in the Home composition without replacing its feed", () => {
  const home = readFileSync(
    new URL("../src/features/home/home-screen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /Tiempo para concentrarte/u);
  assert.match(home, /<HomeRecentOpenedCard/u);
  assert.match(home, /<HomeSavedReturnCard/u);
  assert.match(home, /<FeedSectionHeader/u);
});
