import assert from "node:assert/strict";
import test from "node:test";

import { passwordVisibilityReducer } from "../src/features/auth/password-visibility";

test("password visibility toggles between masked and visible", () => {
  assert.equal(passwordVisibilityReducer(false, "toggle"), true);
  assert.equal(passwordVisibilityReducer(true, "toggle"), false);
});

test("masking always returns a password field to its private state", () => {
  assert.equal(passwordVisibilityReducer(true, "mask"), false);
  assert.equal(passwordVisibilityReducer(false, "mask"), false);
});
