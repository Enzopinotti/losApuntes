import type { ActionTokenInput } from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { AuthActionTokenVault } from "./action-token-vault";

export type EmailVerificationResult =
  | "completed"
  | "invalid_link"
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "failed"
  | "cancelled";

export interface EmailVerificationApi {
  inspectEmailVerification(
    input: ActionTokenInput,
    signal?: AbortSignal,
  ): Promise<{ verification: { available: true } }>;
  completeEmailVerification(
    input: ActionTokenInput,
    signal?: AbortSignal,
  ): Promise<void>;
}

const failureFrom = (error: unknown): EmailVerificationResult => {
  if (error instanceof ApiRequestError) {
    if (error.kind === "offline") return "offline";
    if (error.kind === "timeout") return "timeout";
    if (error.kind === "server_unavailable") return "server_unavailable";
  }
  return "failed";
};

export const completeEmailVerification = async (
  api: EmailVerificationApi,
  vault: AuthActionTokenVault,
  handle: string,
  signal?: AbortSignal,
): Promise<EmailVerificationResult> => {
  const token = vault.take(handle, "email_verification");
  if (!token) return "invalid_link";
  if (signal?.aborted) return "cancelled";

  try {
    await api.inspectEmailVerification({ token }, signal);
    if (signal?.aborted) return "cancelled";
    await api.completeEmailVerification({ token }, signal);
    return signal?.aborted ? "cancelled" : "completed";
  } catch (error) {
    if (signal?.aborted) return "cancelled";
    return failureFrom(error);
  }
};
