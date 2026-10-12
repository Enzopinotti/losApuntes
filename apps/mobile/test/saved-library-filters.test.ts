import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import {
  findLoadedSavedResources,
  loadedSavedSearchSummary,
  SAVED_LIBRARY_QUERY_MAX_LENGTH,
} from "../src/features/resources/saved-library-filters";
import { MobileSavedResourcesController } from "../src/features/resources/resource-consumption-controller";
import type { ResourceConsumptionApi } from "../src/features/resources/resource-consumption-api";

function resource(
  id: string,
  title: string,
  subjectName = "Álgebra",
  options: {
    description?: string;
    author?: string;
    tags?: string[];
  } = {},
): ResourceView {
  return {
    id,
    title,
    description: options.description ?? null,
    tags: options.tags ?? [],
    visibility: "public",
    author: options.author
      ? {
          profileId: "profile-a",
          displayName: options.author,
          avatarUrl: null,
        }
      : null,
    academic: {
      subject: { id: "subject-a", name: subjectName },
      courseOffering: null,
    },
    file: {
      id: `file-${id}`,
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1024,
    },
    capabilities: { edit: false, manageShares: false },
    revision: 1,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
  };
}

test("empty query preserves the server saved order and does not mutate the page", () => {
  const data = [
    resource("b", "Zoología"),
    resource("a", "Álgebra"),
    resource("c", "Cálculo"),
  ];
  const result = findLoadedSavedResources(data, "  ", "saved");

  assert.deepEqual(
    result.map((item) => item.id),
    ["b", "a", "c"],
  );
  assert.notEqual(result, data);
  assert.deepEqual(
    data.map((item) => item.id),
    ["b", "a", "c"],
  );
});

test("saved library search ignores accent, case and extra spaces", () => {
  const data = [
    resource("one", "Resumen de Álgebra"),
    resource("two", "Estadística práctica"),
  ];

  assert.deepEqual(
    findLoadedSavedResources(data, "  RESUMEN   algebra  ", "saved").map(
      (item) => item.id,
    ),
    ["one"],
  );
  assert.deepEqual(
    findLoadedSavedResources(data, "ESTADISTICA", "saved").map(
      (item) => item.id,
    ),
    ["two"],
  );
});

test("query words may match across subject, title, author, description and tags", () => {
  const data = [
    resource("one", "Guía de examen", "Matemática II", {
      author: "Lucía Pérez",
      description: "Problemas resueltos",
      tags: ["parcial", "segundo"],
    }),
    resource("two", "Guía de examen", "Física I", {
      author: "Jorge",
      tags: ["parcial"],
    }),
  ];

  for (const query of [
    "matematica guia",
    "lucia resueltos",
    "PARCIAL SEGUNDO",
    "examen perez",
  ]) {
    assert.deepEqual(
      findLoadedSavedResources(data, query, "saved").map((item) => item.id),
      ["one"],
      query,
    );
  }
});

test("alphabetic title ordering is stable on equal titles and never mutates input", () => {
  const data = [
    resource("z", "Mismo título"),
    resource("c", "Cálculo"),
    resource("b", "Mismo título"),
    resource("a", "Álgebra"),
  ];

  const result = findLoadedSavedResources(data, "", "title");
  assert.deepEqual(
    result.map((item) => item.id),
    ["a", "c", "b", "z"],
  );
  assert.deepEqual(
    data.map((item) => item.id),
    ["z", "c", "b", "a"],
  );
});

test("empty matches are not treated as an empty saved library", () => {
  const data = [resource("one", "Química")];

  assert.deepEqual(
    findLoadedSavedResources(data, "materia inexistente", "saved"),
    [],
  );
  assert.equal(
    loadedSavedSearchSummary(0, 1, true),
    "0 de 1 guardados cargados. Hay más guardados por cargar.",
  );
  assert.equal(
    loadedSavedSearchSummary(1, 1, false),
    "1 de 1 guardados cargados.",
  );
});

test("oversized input is bounded before searching", () => {
  const data = [resource("one", "Álgebra")];
  assert.equal(SAVED_LIBRARY_QUERY_MAX_LENGTH, 120);
  assert.deepEqual(
    findLoadedSavedResources(
      data,
      "algebra" + " ".repeat(SAVED_LIBRARY_QUERY_MAX_LENGTH),
      "saved",
    ).map((item) => item.id),
    ["one"],
  );
});

test("loading more expands the search window, and removal updates results", async () => {
  const first = resource("one", "Química", "Química");
  const next = resource("two", "Álgebra");
  const savedCalls: Array<string | undefined> = [];
  const removals: string[] = [];
  const api = {
    saved: async (cursor?: string) => {
      savedCalls.push(cursor);
      return cursor
        ? { items: [next], nextCursor: null }
        : { items: [first], nextCursor: "page-two" };
    },
    unsave: async (resourceId: string) => {
      removals.push(resourceId);
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);

  await controller.load("session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    findLoadedSavedResources(snapshot.data.items, "algebra", "saved"),
    [],
  );
  assert.equal(snapshot.data.nextCursor, "page-two");

  await controller.loadMore("session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    findLoadedSavedResources(snapshot.data.items, "algebra", "saved").map(
      (item) => item.id,
    ),
    ["two"],
  );

  await controller.removeSaved("session-a", "two");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(
    findLoadedSavedResources(snapshot.data.items, "algebra", "saved"),
    [],
  );
  assert.deepEqual(savedCalls, [undefined, "page-two"]);
  assert.deepEqual(removals, ["two"]);
});

test("screen presents loaded-page limitations and resets filters on account change", () => {
  const screen = readFileSync(
    new URL(
      "../src/features/resources/saved-resources-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    screen,
    /findLoadedSavedResources\(current\.data\.items, query, sort\)/u,
  );
  assert.match(screen, /sessionKey\]/u);
  assert.match(screen, /setQuery\(""\)/u);
  assert.match(screen, /setSort\("saved"\)/u);
  assert.match(screen, /Cargar más guardados/u);
  assert.match(screen, /guardados cargados/u);
});
