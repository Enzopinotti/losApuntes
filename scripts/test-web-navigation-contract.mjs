import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const layout = await read("apps/web/src/layouts/Layout.tsx");
const styles = await read("apps/web/src/layouts/Layout.scss");
const routes = await read("apps/web/src/app/routes.tsx");

const publicNav = layout.match(
  /const publicNavigation:[\s\S]*?(?=const memberNavigation:)/u,
)?.[0];
const memberNav = layout.match(
  /const memberNavigation:[\s\S]*?(?=const memberMoreNavigation:)/u,
)?.[0];
const moreNav = layout.match(
  /const memberMoreNavigation:[\s\S]*?(?=const Layout =)/u,
)?.[0];

assert.ok(publicNav, "Public navigation must remain a separate explicit set");
assert.ok(memberNav, "Authenticated main navigation must be explicit");
assert.ok(moreNav, "Authenticated secondary navigation must be explicit");

for (const destination of ["/", "/search", "/resources", "/questions", "/organizations"]) {
  assert.ok(publicNav.includes(`to: "${destination}"`), `Public route missing: ${destination}`);
}
for (const destination of ["/", "/feeds", "/network", "/search", "/resources"]) {
  assert.ok(memberNav.includes(`to: "${destination}"`), `Member route missing: ${destination}`);
}
for (const destination of [
  "/questions",
  "/organizations",
  "/academic/lifecycle",
  "/profile",
  "/dashboard",
  "/settings/security",
]) {
  assert.ok(moreNav.includes(`to: "${destination}"`), `Secondary route missing: ${destination}`);
}
assert.doesNotMatch(publicNav, /\/feeds|\/network|\/profile|\/notifications/u);
assert.match(layout, /authenticated \? memberNavigation : publicNavigation/u);
assert.match(layout, /authenticated \? \(/u);
assert.match(layout, /useLocation\(\)/u);
assert.match(layout, /location\.key/u);
assert.match(layout, /user\?\.id/u);
assert.match(layout, /aria-label="Navegación principal"/u);
assert.match(layout, /aria-expanded=\{mobileOpen\}/u);
assert.match(layout, /aria-controls=\{menuId\}/u);
assert.match(layout, /aria-expanded=\{moreOpen\}/u);
assert.match(layout, /aria-controls=\{moreId\}/u);
assert.match(layout, /onClick=\{closeNavigation\}/u);
assert.match(layout, /Saltar al contenido/u);
assert.match(layout, /href="#contenido-principal"/u);
assert.match(layout, /<main id="contenido-principal" tabIndex=\{-1\}>/u);
assert.match(layout, /<LogoutButton\s*\/>/u);
assert.equal(
  (layout.match(/<LogoutButton\\s*\\/>/gu) ?? []).length,
  2,
  "Desktop and collapsed mobile navigation each provide a logout action",
);
assert.match(layout, /className="layout-mobile-session"/u);
assert.match(layout, /className="layout-mobile-notifications"/u);
assert.match(layout, /\/notifications/u);
assert.match(layout, /\/login/u);
assert.match(layout, /\/sign-up/u);
assert.doesNotMatch(layout, /localStorage|sessionStorage/u);

for (const destination of ["/feeds", "/network", "/profile", "/notifications", "/academic/lifecycle"]) {
  const route = destination.slice(1).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  assert.match(routes, new RegExp(`path: "${route}"`, "u"));
}

assert.match(styles, /\.layout-nav-open/u);
assert.match(styles, /@media \(max-width: 1180px\)/u);
assert.match(styles, /@media \(max-width: 600px\)/u);
assert.match(styles, /prefers-reduced-motion/u);
assert.match(styles, /focus-visible/u);
assert.match(styles, /grid-template-areas/u);
assert.match(styles, /min-height: 100dvh/u);
assert.match(styles, /"session session"/u);
assert.match(styles, /\\.layout-nav \\.layout-session-actions\\s*\\{\\s*display: none/u);
assert.match(styles, /\\.layout-mobile-session\\s*\\{[\\s\\S]*?display: flex/u);
assert.match(styles, /\\.layout-mobile-session \\.layout-mobile-notifications/u);
assert.match(styles, /\\.layout-notifications-link\\s*\\{\\s*display: none/u);
assert.match(styles, /main\s*\{\s*flex: 1/u);
assert.doesNotMatch(styles, /main\s*\{\s*height:\s*100vh/u);

console.log("PASS Web responsive navigation and route scoping contract");
