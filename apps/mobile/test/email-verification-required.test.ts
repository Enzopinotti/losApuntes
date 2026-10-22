import assert from "node:assert/strict";
import test from "node:test";

import { isEmailVerificationRequired } from "../src/features/auth/email-verification-required";
import { ApiRequestError } from "../src/services/api/client";

test("only the verified-credential server error enables email verification recovery", () => {
  assert.equal(
    isEmailVerificationRequired(
      new ApiRequestError(
        "forbidden",
        403,
        "EMAIL_VERIFICATION_REQUIRED",
        "Email verification required",
      ),
    ),
    true,
  );
  assert.equal(
    isEmailVerificationRequired(
      new ApiRequestError(
        "unauthorized",
        401,
        "INVALID_CREDENTIALS",
        "Invalid credentials",
      ),
    ),
    false,
  );
  assert.equal(
    isEmailVerificationRequired(new Error("network failure")),
    false,
  );
});
