import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Network opens the private received replies surface", () => {
  const network = readFileSync(
    new URL("../src/features/community/community-screens.tsx", import.meta.url),
    "utf8",
  );
  const route = readFileSync(
    new URL("../src/app/qa-received-replies.tsx", import.meta.url),
    "utf8",
  );
  const screen = readFileSync(
    new URL(
      "../src/features/community/qa-received-replies-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(network, /label="Ver respuestas recibidas"/u);
  assert.match(network, /router\.push\("\/qa-received-replies"\)/u);
  assert.match(route, /QaReceivedRepliesScreen/u);
  assert.match(screen, /pathname: "\/questions\/\[questionId\]"/u);
  assert.match(screen, /isAccepted \?\s*\(/u);
  assert.doesNotMatch(screen, /answerBody|authorName|authorId/u);
});
