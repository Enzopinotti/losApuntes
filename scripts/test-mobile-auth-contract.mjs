import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  store,
  controller,
  provider,
  authenticatedApi,
  client,
  contracts,
  deepLinks,
  forgotPassword,
  register,
  openEmailApp,
  signIn,
  verificationRequired,
  resetPassword,
  verifyEmail,
  app,
  pkg,
] = await Promise.all([
  read("apps/mobile/src/platform/session-credential-store.ts"),
  read("apps/mobile/src/features/session/session-controller.ts"),
  read("apps/mobile/src/features/session/session-provider.tsx"),
  read("apps/mobile/src/features/session/authenticated-api.ts"),
  read("apps/mobile/src/services/api/client.ts"),
  read("packages/contracts/src/auth.ts"),
  read("apps/mobile/src/features/auth/auth-deep-link.ts"),
  read("apps/mobile/src/app/forgot-password.tsx"),
  read("apps/mobile/src/app/register.tsx"),
  read("apps/mobile/src/features/auth/open-email-app.ts"),
  read("apps/mobile/src/app/sign-in.tsx"),
  read("apps/mobile/src/features/auth/email-verification-required.ts"),
  read("apps/mobile/src/app/reset-password.tsx"),
  read("apps/mobile/src/app/verify-email.tsx"),
  read("apps/mobile/app.json"),
  read("apps/mobile/package.json"),
]);

assert.match(store, /expo-secure-store/u);
assert.match(store, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/u);
assert.doesNotMatch(
  `${store}\n${controller}`,
  /AsyncStorage|localStorage|sessionStorage|react-native-mmkv/u,
);
assert.match(client, /redirect:\s*"error"/u);
assert.match(client, /CROSS_ORIGIN_REQUEST_BLOCKED/u);
assert.doesNotMatch(
  client,
  /console\.(?:log|warn|error)|searchParams\.set\([^)]*(?:token|credential|authorization)/iu,
);
assert.match(controller, /generation/u);
assert.match(authenticatedApi, /AuthSessionListResponse/u);
assert.match(contracts, /interface AuthSessionListResponse/u);
assert.match(contracts, /truncated:\s*boolean/u);
assert.match(contracts, /limit:\s*number/u);
assert.match(controller, /bestEffortRevokeCandidate/u);
assert.match(controller, /revalidateCurrent/u);
assert.match(controller, /suspend\(\): void/u);
assert.match(provider, /AppState\.addEventListener/u);
assert.match(provider, /controller\.revalidateCurrent/u);
assert.match(provider, /controller\.suspend/u);
assert.match(deepLinks, /url\.protocol\s*!==\s*"losapuntes:"/u);
assert.match(deepLinks, /ACTION_TOKEN_PATTERN/u);
assert.match(forgotPassword, /authActionResendSecondsRemaining/u);
assert.match(forgotPassword, /disabled=\{[^}]*resendCooldownSeconds/u);
assert.match(
  forgotPassword,
  /result === "accepted"\s*\?\s*authActionResendAvailableAt/u,
);
assert.match(register, /authActionResendSecondsRemaining/u);
assert.match(register, /authActionResendAvailableAt/u);
assert.match(register, /disabled=\{pending \|\| resendCooldownSeconds > 0\}/u);
assert.match(openEmailApp, /android\.intent\.action\.MAIN/u);
assert.match(openEmailApp, /android\.intent\.category\.APP_EMAIL/u);
assert.match(register, /showSuccess && Platform\.OS === "android"/u);
assert.match(register, /Abrir app de correo/u);
assert.match(signIn, /isEmailVerificationRequired\(error\)/u);
assert.match(verificationRequired, /EMAIL_VERIFICATION_REQUIRED/u);
assert.match(signIn, /requestEmailVerification/u);
assert.match(signIn, /authActionResendSecondsRemaining/u);
assert.match(signIn, /Si hay una cuenta pendiente para ese email/u);
for (const tokenRoute of [resetPassword, verifyEmail]) {
  assert.match(
    tokenRoute,
    /AccessibilityInfo\.sendAccessibilityEvent\(status,\s*"focus"\)/u,
  );
}

const appJson = JSON.parse(app);
assert.equal(appJson.expo.scheme, "losapuntes");
assert.ok(appJson.expo.plugins.includes("expo-secure-store"));
assert.equal(appJson.expo.experiments.typedRoutes, true);

const packageJson = JSON.parse(pkg);
assert.equal(packageJson.dependencies["@losapuntes/contracts"], "workspace:*");
assert.ok(packageJson.dependencies["expo-secure-store"]);
assert.ok(packageJson.dependencies["expo-intent-launcher"]);
