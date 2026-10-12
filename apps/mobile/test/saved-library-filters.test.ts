import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ResourceView } from "@losapuntes/contracts";

import {
  activeLoadedSavedSubject,
  findLoadedSavedResources,
  loadedSavedLibrarySubjects,
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
    subjectId?: string;
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
      subject: {
        id: options.subjectId ?? "subject-a",
        name: subjectName,
      },
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
    /findLoadedSavedResources\(\s*current\.data\.items,\s*query,\s*sort,\s*activeSubjectId,\s*\)/u,
  );
  assert.match(screen, /sessionKey\]/u);
  assert.match(screen, /setQuery\(""\)/u);
  assert.match(screen, /setSort\("saved"\)/u);
  assert.match(screen, /Cargar más guardados/u);
  assert.match(screen, /guardados cargados/u);
});

test("saved subjects group by academic ID with loaded counts and Spanish order", () => {
  const resources = [
    resource("c1", "Guía", "Cálculo", { subjectId: "subject-c" }),
    resource("b1", "Resumen", "Álgebra", { subjectId: "subject-a" }),
    resource("d1", "Parcial", "Cálculo", { subjectId: "subject-d" }),
    resource("c2", "Fórmulas", "Cálculo", { subjectId: "subject-c" }),
  ];

  assert.deepEqual(loadedSavedLibrarySubjects(resources), [
    { id: "subject-a", name: "Álgebra", loadedCount: 1 },
    { id: "subject-c", name: "Cálculo", loadedCount: 2 },
    { id: "subject-d", name: "Cálculo", loadedCount: 1 },
  ]);
  assert.deepEqual(
    resources.map((resource) => resource.id),
    ["c1", "b1", "d1", "c2"],
  );
});

test("subject selection only accepts a currently loaded academic ID", () => {
  const subjects = loadedSavedLibrarySubjects([
    resource("one", "Resumen", "Álgebra", { subjectId: "subject-a" }),
  ]);
  assert.equal(activeLoadedSavedSubject(subjects, null), null);
  assert.equal(activeLoadedSavedSubject(subjects, "subject-a"), "subject-a");
  assert.equal(activeLoadedSavedSubject(subjects, "subject-b"), null);
  assert.equal(activeLoadedSavedSubject([], "subject-a"), null);
});

test("subject selection composes with multi-field search and title ordering", () => {
  const resources = [
    resource("z", "Teoría", "Álgebra", {
      subjectId: "subject-a",
      author: "Ana",
      tags: ["parcial"],
    }),
    resource("b", "Ejercicios", "Álgebra", {
      subjectId: "subject-a",
      author: "Ana",
      tags: ["parcial"],
    }),
    resource("c", "Ejercicios", "Análisis", {
      subjectId: "subject-b",
      author: "Ana",
      tags: ["parcial"],
    }),
    resource("d", "Ejercicios", "Álgebra", {
      subjectId: "subject-a-2",
      author: "Ana",
      tags: ["parcial"],
    }),
  ];

  assert.deepEqual(
    findLoadedSavedResources(
      resources,
      "ANA PARCIAL",
      "title",
      "subject-a",
    ).map((item) => item.id),
    ["b", "z"],
  );
  assert.deepEqual(
    findLoadedSavedResources(resources, "ANA PARCIAL", "saved").map(
      (item) => item.id,
    ),
    ["z", "b", "c", "d"],
  );
});

test("subject grouping reflects newly loaded pages and does not imply global counts", async () => {
  const firstPage = resource("one", "Apunte I", "Historia", {
    subjectId: "history",
  });
  const secondPage = resource("two", "Apunte II", "Historia", {
    subjectId: "history",
  });
  const another = resource("three", "Apunte III", "Geometría", {
    subjectId: "geometry",
  });
  const calls: Array<string | undefined> = [];
  const api = {
    saved: async (cursor?: string) => {
      calls.push(cursor);
      return cursor
        ? { items: [secondPage, another], nextCursor: null }
        : { items: [firstPage], nextCursor: "next-page" };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);

  await controller.load("session-a");
  let snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(loadedSavedLibrarySubjects(snapshot.data.items), [
    { id: "history", name: "Historia", loadedCount: 1 },
  ]);
  assert.equal(snapshot.data.nextCursor, "next-page");

  await controller.loadMore("session-a");
  snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.deepEqual(loadedSavedLibrarySubjects(snapshot.data.items), [
    { id: "geometry", name: "Geometría", loadedCount: 1 },
    { id: "history", name: "Historia", loadedCount: 2 },
  ]);
  assert.deepEqual(calls, [undefined, "next-page"]);
});

test("removing the last saved resource clears an obsolete subject selection", async () => {
  const a = resource("a", "Parcial", "Física", { subjectId: "physics" });
  const b = resource("b", "Resumen", "Química", { subjectId: "chemistry" });
  const api: ResourceConsumptionApi = {
    saved: async () => ({ items: [a, b], nextCursor: null }),
    unsave: async () => undefined,
    resource: async (id) => ({ resource: resource(id, "Otro") }),
    access: async () => ({
      file: a.file,
      access: {
        url: "https://storage.example.invalid/unused",
        expiresAt: "2026-10-12T00:00:00.000Z",
      },
    }),
    save: async () => ({ saved: true }),
  };
  const controller = new MobileSavedResourcesController(api);

  await controller.load("session-a");
  await controller.removeSaved("session-a", "a");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  const subjects = loadedSavedLibrarySubjects(snapshot.data.items);
  assert.equal(activeLoadedSavedSubject(subjects, "physics"), null);
  assert.deepEqual(
    findLoadedSavedResources(snapshot.data.items, "", "saved").map(
      (item) => item.id,
    ),
    ["b"],
  );
});

test("subject groups never show a previous account after authority change", async () => {
  const calls: Array<string | undefined> = [];
  const api = {
    saved: async (_cursor?: string) => {
      calls.push(_cursor);
      return calls.length === 1
        ? {
            items: [
              resource("first", "Solo A", "Matemática", {
                subjectId: "subject-a",
              }),
            ],
            nextCursor: null,
          }
        : {
            items: [
              resource("second", "Solo B", "Literatura", {
                subjectId: "subject-b",
              }),
            ],
            nextCursor: null,
          };
    },
  } as ResourceConsumptionApi;
  const controller = new MobileSavedResourcesController(api);

  await controller.load("session-a");
  controller.invalidate("session-a");
  await controller.load("session-b");
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.kind, "ready");
  if (snapshot.kind !== "ready") return;
  assert.equal(snapshot.authorityKey, "session-b");
  const groups = loadedSavedLibrarySubjects(snapshot.data.items);
  assert.deepEqual(groups, [
    { id: "subject-b", name: "Literatura", loadedCount: 1 },
  ]);
  assert.equal(activeLoadedSavedSubject(groups, "subject-a"), null);
});

test("native subject selection is accessible and retains pagination controls", () => {
  const screen = readFileSync(
    new URL(
      "../src/features/resources/saved-resources-screen.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(screen, /Tus materias/u);
  assert.match(screen, /loadedSavedLibrarySubjects\(current\.data\.items\)/u);
  assert.match(screen, /accessibilityLabel="Todas las materias"/u);
  assert.match(screen, /accessibilityRole="radio"/u);
  assert.match(screen, /setSelectedSubjectId\(subject\.id\)/u);
  assert.match(screen, /setSelectedSubjectId\(null\)/u);
  assert.match(screen, /activeSubjectId/u);
  assert.match(screen, /controller\.loadMore\(current\.authorityKey\)/u);
  assert.match(screen, /controller\.removeSaved\(/u);
});
