import assert from "node:assert/strict";
import test from "node:test";
import { verifyChromiumRuntime } from "./playwright-browser-preflight.mjs";

function fakeChromium({ text = "Browser smoke ready", sum = 10, failLaunch = false, failSetContent = false } = {}) {
  const calls = [];
  return {
    calls,
    browserType: {
      async launch(options) {
        calls.push(["launch", options]);
        if (failLaunch) throw new Error("missing Chromium binary or Linux libraries");
        return {
          async newContext(options) {
            calls.push(["context", options]);
            return {
              async newPage() {
                calls.push(["page"]);
                return {
                  async setContent(html) {
                    calls.push(["render", html]);
                    if (failSetContent) throw new Error("render failed");
                  },
                  locator(selector) {
                    calls.push(["locator", selector]);
                    return { async textContent() { return text; } };
                  },
                  async evaluate(callback) {
                    calls.push(["evaluate", typeof callback]);
                    return sum;
                  },
                };
              },
              async close() { calls.push(["closeContext"]); },
            };
          },
          async close() { calls.push(["closeBrowser"]); },
        };
      },
    },
  };
}

test("browser preflight must launch real runtime, render DOM and evaluate JavaScript", async () => {
  const mock = fakeChromium();
  await verifyChromiumRuntime(mock.browserType);
  assert.deepEqual(mock.calls.map(([name]) => name), [
    "launch", "context", "page", "render", "locator", "evaluate",
    "closeContext", "closeBrowser",
  ]);
  assert.deepEqual(mock.calls[0][1], { headless: true });
  assert.equal(mock.calls[1][1].javaScriptEnabled, true);
  assert.equal(mock.calls[1][1].acceptDownloads, false);
});

test("browser installation or OS library failure must never silently pass", async () => {
  const mock = fakeChromium({ failLaunch: true });
  await assert.rejects(
    verifyChromiumRuntime(mock.browserType),
    /missing Chromium binary or Linux libraries/u,
  );
  assert.deepEqual(mock.calls.map(([name]) => name), ["launch"]);
});

test("incorrect DOM result fails and still closes browser plus context", async () => {
  const mock = fakeChromium({ text: "" });
  await assert.rejects(verifyChromiumRuntime(mock.browserType), /render DOM/u);
  assert.deepEqual(mock.calls.slice(-2).map(([name]) => name), [
    "closeContext", "closeBrowser",
  ]);
});

test("incorrect JavaScript result fails and still closes resources", async () => {
  const mock = fakeChromium({ sum: 0 });
  await assert.rejects(
    verifyChromiumRuntime(mock.browserType),
    /execute JavaScript/u,
  );
  assert.deepEqual(mock.calls.slice(-2).map(([name]) => name), [
    "closeContext", "closeBrowser",
  ]);
});

test("render exception also propagates and always closes browser", async () => {
  const mock = fakeChromium({ failSetContent: true });
  await assert.rejects(verifyChromiumRuntime(mock.browserType), /render failed/u);
  assert.deepEqual(mock.calls.slice(-2).map(([name]) => name), [
    "closeContext", "closeBrowser",
  ]);
});
