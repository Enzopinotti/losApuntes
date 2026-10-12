import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CommunityPerson } from "@losapuntes/contracts/social-qa";

import { communityAuthorAction } from "../src/features/community/community-author-action";

const author: CommunityPerson = {
  profileId: "profile-a",
  displayName: "Ada Lovelace",
  avatarUrl: null,
};

test("community author action opens the matching public profile accessibly", () => {
  assert.deepEqual(communityAuthorAction(author), {
    accessibilityHint: "Abre el perfil público de Ada Lovelace.",
    accessibilityLabel: "Abrir perfil de Ada Lovelace",
    displayName: "Ada Lovelace",
    href: {
      pathname: "/profiles/[profileId]",
      params: { profileId: "profile-a" },
    },
  });
});

test("community author action fails closed for absent or malformed profile ids", () => {
  assert.equal(communityAuthorAction(null), null);
  assert.equal(communityAuthorAction({ ...author, profileId: "" }), null);
  assert.equal(
    communityAuthorAction({ ...author, profileId: " profile-a" }),
    null,
  );
  assert.equal(
    communityAuthorAction({ ...author, profileId: "profile-a " }),
    null,
  );
});

test("community author action uses a safe visible name when attribution is blank", () => {
  assert.equal(
    communityAuthorAction({ ...author, displayName: "   " })
      ?.accessibilityLabel,
    "Abrir perfil de Persona de la comunidad",
  );
});

test("Q&A author attribution links separately from the question and answer content", () => {
  const screen = readFileSync(
    new URL("../src/features/community/community-screens.tsx", import.meta.url),
    "utf8",
  );

  assert.match(screen, /accessibilityRole="link"/u);
  assert.match(screen, /accessibilityHint=\{action\.accessibilityHint\}/u);
  assert.match(screen, /router\.push\(action\.href\)/u);
  assert.match(
    screen,
    /CommunityAuthorAttribution author=\{question\.author\}/u,
  );
  assert.match(screen, /CommunityAuthorAttribution author=\{answer\.author\}/u);
  assert.match(screen, /onPress=\{onPress\}/u);
});
