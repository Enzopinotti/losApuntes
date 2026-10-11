import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMIC_CONTEXT_HOME_ROUTE,
  contextualDiscoveryEmptyCopy,
} from "../src/features/search/search-contextual-discovery-copy";

test("no-context discovery gives a route to the existing academic selector", () => {
  assert.deepEqual(contextualDiscoveryEmptyCopy(true), {
    message:
      "Todavía no hay una materia actual validada. Configurá tu contexto académico desde Inicio para descubrir recursos relevantes.",
    configureContextLabel: "Configurar contexto académico",
  });
  assert.equal(ACADEMIC_CONTEXT_HOME_ROUTE, "/(tabs)/home");
});

test("an empty discovery with a valid context does not ask to configure it", () => {
  assert.deepEqual(contextualDiscoveryEmptyCopy(false), {
    message: "No encontramos recursos visibles para tus materias actuales.",
    configureContextLabel: null,
  });
});
