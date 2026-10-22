import { ApiRequestError } from "@/services/api/client";

export const isEmailVerificationRequired = (error: unknown): boolean =>
  error instanceof ApiRequestError &&
  error.code === "EMAIL_VERIFICATION_REQUIRED";
