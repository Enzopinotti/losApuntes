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
  passwordVisibilityInput,
  resetPassword,
  security,
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
  read("apps/mobile/src/features/auth/password-visibility-input.tsx"),
  read("apps/mobile/src/app/reset-password.tsx"),
  read("apps/mobile/src/app/security.tsx"),
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

assert.match(passwordVisibilityInput, /secureTextEntry=\{!visible\}/u);
assert.match(passwordVisibilityInput, /AppState\.addEventListener\("change"/u);
assert.match(passwordVisibilityInput, /state !== "active"/u);
assert.match(passwordVisibilityInput, /accessibilityRole="switch"/u);
assert.match(
  passwordVisibilityInput,
  /accessibilityState=\{\{ checked: visible/u,
);
assert.match(passwordVisibilityInput, /minHeight:\s*44/u);

const passwordInputCount = (source) =>
  (source.match(/<PasswordVisibilityInput\b/gu) ?? []).length;

assert.equal(passwordInputCount(signIn), 1);
assert.equal(passwordInputCount(register), 2);
assert.equal(passwordInputCount(resetPassword), 2);
assert.equal(passwordInputCount(security), 4);
assert.match(security, /fieldLabel="Contraseña actual para Google"/u);
for (const screen of [signIn, register, resetPassword, security]) {
  assert.doesNotMatch(screen, /secureTextEntry/u);
}
assert.doesNotMatch(security, /showCurrentPassword|showNewPasswords/u);
