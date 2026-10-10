import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActionableHomeContent,
  homeFeedItemAction,
  homeFirstValueActions,
} from "../src/features/home/home-first-value";

test("Home resources and questions target their existing detail routes", () => {
  const resource = homeFeedItemAction({
    type: "resource",
    id: "resource-1",
    title: "Resumen de Álgebra",
  });
  assert.deepEqual(resource?.href, {
    pathname: "/resources/[id]",
    params: { id: "resource-1" },
  });
  assert.equal(
    resource?.accessibilityLabel,
    "Abrir apunte: Resumen de Álgebra",
  );
  assert.match(resource?.accessibilityHint ?? "", /permisos actuales/);

  const question = homeFeedItemAction({
    type: "question",
    id: "question-1",
    title: "¿Cómo se resuelve este límite?",
  });
  assert.deepEqual(question?.href, {
    pathname: "/questions/[questionId]",
    params: { questionId: "question-1" },
  });
  assert.equal(
    question?.accessibilityLabel,
    "Abrir pregunta: ¿Cómo se resuelve este límite?",
  );
});

test("Home does not invent a destination for organization posts", () => {
  assert.equal(
    homeFeedItemAction({
      type: "organization_post",
      id: "post-1",
      title: "Novedades",
    }),
    null,
  );
});

test("empty Home actions link to Search and gate question creation on a current subject", () => {
  const withoutSubject = homeFirstValueActions(false);
  assert.deepEqual(
    withoutSubject.map((action) => [action.id, action.href]),
    [["search", "/(tabs)/search"]],
  );
  assert.equal(
    withoutSubject[0]?.accessibilityLabel,
    "Buscar apuntes y materias",
  );

  const withSubject = homeFirstValueActions(true);
  assert.deepEqual(
    withSubject.map((action) => [action.id, action.href]),
    [
      ["search", "/(tabs)/search"],
      ["question", "/questions/new"],
    ],
  );
  assert.match(withSubject[1]?.accessibilityHint ?? "", /pregunta académica/);
});

test("Home shows next-step actions only when no resource or question can be opened", () => {
  assert.equal(
    hasActionableHomeContent({
      items: [{ type: "organization_post" }],
    }),
    false,
  );
  assert.equal(
    hasActionableHomeContent({
      items: [{ type: "resource" }],
    }),
    true,
  );
  assert.equal(
    hasActionableHomeContent({ items: [] }, { items: [{ type: "question" }] }),
    true,
  );
});
