import { captureEmailVerificationLink } from "@/features/auth/auth-deep-link";
import { mobileAuthActionTokenVault } from "@/features/auth/action-token-runtime";

export function redirectSystemPath({ path }: { path: string }): string {
  try {
    return (
      captureEmailVerificationLink(path, mobileAuthActionTokenVault) ?? path
    );
  } catch {
    return "/sign-in?notice=invalid-action-link";
  }
}
