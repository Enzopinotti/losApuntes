import assert from "node:assert/strict";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import { buildMobileResourceCitation } from "../src/features/resources/resource-citation";

const resource = (overrides: Partial<ResourceView> = {}): ResourceView => ({
  id: "40e5593b-3d2c-4df8-a7f3-030829f201c4",
  title: "Álgebra lineal",
  description: null,
  tags: [],
  visibility: "private",
  author: {
    profileId: "profile-1",
    displayName: "Ana Pérez",
    avatarUrl: null,
  },
  academic: {
    subject: { id: "subject-1", name: "Matemática I" },
    courseOffering: null,
  },
  file: {
    id: "file-1",
    filename: "algebra.pdf",
    mimeType: "application/pdf",
    byteSize: 100,
  },
  capabilities: { edit: false, manageShares: false },
  revision: 1,
  createdAt: "2026-10-22T00:00:00.000Z",
  updatedAt: "2026-10-22T00:00:00.000Z",
  ...overrides,
});

test("mobile citation uses only the displayed author, title, and subject", () => {
  assert.equal(
    buildMobileResourceCitation(resource()),
    "Ana Pérez. (s. f.). Álgebra lineal [Apunte de Matemática I]. Los Apuntes.",
  );
});

test("mobile citation avoids inferring a date and handles missing authors", () => {
  assert.equal(
    buildMobileResourceCitation(resource({ author: null })),
    "Autoría no indicada. (s. f.). Álgebra lineal [Apunte de Matemática I]. Los Apuntes.",
  );
});

test("mobile citation strips control and bidirectional override characters", () => {
  assert.equal(
    buildMobileResourceCitation(
      resource({
        title: "Álgebra\u202e\nlineal",
        author: {
          profileId: "profile-1",
          displayName: "Ana\u200f Pérez",
          avatarUrl: null,
        },
      }),
    ),
    "Ana Pérez. (s. f.). Álgebra lineal [Apunte de Matemática I]. Los Apuntes.",
  );
});

test("mobile citation fails closed for malformed or oversized metadata", () => {
  assert.equal(
    buildMobileResourceCitation(resource({ id: "not-a-uuid" })),
    null,
  );
  assert.equal(buildMobileResourceCitation(resource({ title: "  " })), null);
  assert.equal(
    buildMobileResourceCitation(resource({ title: "x".repeat(251) })),
    null,
  );
  assert.equal(
    buildMobileResourceCitation(
      resource({
        academic: {
          subject: { id: "subject-1", name: "" },
          courseOffering: null,
        },
      }),
    ),
    null,
  );
});
