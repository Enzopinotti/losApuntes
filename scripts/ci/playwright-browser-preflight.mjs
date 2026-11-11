import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

/**
 * This is a real browser gate, not a dry-run or browser-mock fallback.
 * The runner must have an executable Playwright-managed Chromium and all
 * required Linux libraries. Failures propagate before the Docker smoke.
 */
export async function verifyChromiumRuntime(browserType = chromium) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      acceptDownloads: false,
    });
    try {
      const page = await context.newPage();
      await page.setContent(
        '<main data-runtime-preflight="chromium">Browser smoke ready</main>',
      );
      assert.equal(
        await page.locator('[data-runtime-preflight="chromium"]').textContent(),
        "Browser smoke ready",
        "Chromium must actually render DOM",
      );
      assert.equal(
        await page.evaluate(() => [2, 3, 5].reduce((sum, n) => sum + n, 0)),
        10,
        "Chromium must execute JavaScript",
      );
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

const directInvocation =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (directInvocation) {
  try {
    await verifyChromiumRuntime();
    process.stdout.write(
      "PASS Playwright-managed Chromium launches, renders DOM and executes JavaScript\n",
    );
  } catch (error) {
    process.stderr.write("FAIL Chromium runtime preflight; browser smoke remains blocked\n");
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
