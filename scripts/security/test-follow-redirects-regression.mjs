import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inspectFollowRedirectsLock } from "./check-follow-redirects-lock.mjs";

const requireWeb = createRequire(pathToFileURL(resolve("apps/web/package.json")));
const axios = requireWeb("axios");
const requireAxios = createRequire(requireWeb.resolve("axios"));
const redirects = requireAxios("follow-redirects");
const redirectsVersion = requireAxios("follow-redirects/package.json").version;
const SECRET = "b164-only-synthetic-test-secret";

async function listen(host, handler) {
  const server = createServer(handler);
  server.listen(0, host);
  await once(server, "listening");
  return server;
}
async function close(server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolveClose, reject) =>
    server.close((error) => error ? reject(error) : resolveClose()));
}
async function withRedirect(action) {
  let lastHeaders = null;
  // Two distinct IPv4 loopback hostnames, without DNS or external egress.
  const dest = await listen("127.0.0.2", (req, res) => {
    lastHeaders = req.headers;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ reached: true }));
  });
  const destPort = dest.address().port;
  const origin = await listen("127.0.0.1", (_req, res) => {
    res.writeHead(302, { Location: "http://127.0.0.2:" + destPort + "/target" });
    res.end();
  });
  const originUrl = "http://127.0.0.1:" + origin.address().port + "/redirect";
  try {
    await action({ originUrl, received: () => lastHeaders });
  } finally {
    await close(origin);
    await close(dest);
  }
}
function requestRedirect(url, options) {
  return new Promise((resolveResponse, reject) => {
    let request;
    try {
      request = redirects.http.get({
        ...options, hostname: "127.0.0.1",
        port: new URL(url).port, path: "/redirect", timeout: 3500,
      }, (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (part) => { raw += part; });
        response.on("end", () => {
          if (response.statusCode !== 200) return reject(new Error("HTTP " + response.statusCode));
          try { resolveResponse(JSON.parse(raw)); } catch (err) { reject(err); }
        });
        response.on("error", reject);
      });
    } catch (error) {
      reject(error);
      return;
    }
    request.on("timeout", () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
  });
}

test("B190 frozen pnpm Web chain pins official 1.16.1 and installed Axios resolver", async () => {
  const source = await readFile("pnpm-lock.yaml", "utf8");
  const evidence = inspectFollowRedirectsLock(source);
  assert.equal(evidence.version, "1.16.1");
  assert.equal(redirectsVersion, "1.16.1");
  assert.equal(evidence.productionAuditCertified, false);
  assert.equal(evidence.releaseAuthorized, false);
});

test("B190 Axios normal cross-origin redirects work without forwarding credentials", async () => {
  await withRedirect(async ({ originUrl, received }) => {
    const result = await axios.get(originUrl, {
      proxy: false, timeout: 3500, maxRedirects: 3,
      headers: {
        Authorization: "Bearer " + SECRET,
        Cookie: "sid=" + SECRET,
        "X-Allowed-Trace": "b164-allowed",
      },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { reached: true });
    const headers = received();
    assert.ok(headers);
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    assert.equal(headers["x-allowed-trace"], "b164-allowed");
  });
});

test("B190 special ^ and | sensitive headers are stripped on cross-origin redirect", async () => {
  await withRedirect(async ({ originUrl, received }) => {
    const result = await requestRedirect(originUrl, {
      headers: {
        "X-Api^Key": SECRET, "X-Token|Secret": SECRET,
        "X-Allowed-Trace": "b164-allowed",
      },
      sensitiveHeaders: ["X-Api^Key", "X-Token|Secret"],
    });
    assert.deepEqual(result, { reached: true });
    const headers = received();
    assert.ok(headers);
    assert.equal(headers["x-api^key"], undefined);
    assert.equal(headers["x-token|secret"], undefined);
    assert.equal(headers["x-allowed-trace"], "b164-allowed");
  });
});

test("B190 array-form headers are sanitized or explicitly rejected before redirect", async () => {
  await withRedirect(async ({ originUrl, received }) => {
    try {
      const result = await requestRedirect(originUrl, {
        headers: [
          "Authorization", "Bearer " + SECRET,
          "Cookie", "sid=" + SECRET,
          "X-Allowed-Trace", "b164-allowed",
        ],
      });
      assert.deepEqual(result, { reached: true });
      assert.ok(received());
      assert.equal(received().authorization, undefined);
      assert.equal(received().cookie, undefined);
    } catch (error) {
      assert.ok(error instanceof TypeError && /headers|array/iu.test(error.message),
        "array header refusal must be a clear type error, not any network failure");
      assert.equal(received(), null);
    }
  });
});

test("B190 reject tampered lock version, integrity, edge or format", async () => {
  const source = await readFile("pnpm-lock.yaml", "utf8");
  const expected = "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==";
  for (const bad of [
    source.replaceAll("follow-redirects@1.16.1", "follow-redirects@1.16.0"),
    source.replace("follow-redirects: 1.16.1", "follow-redirects: 1.16.0"),
    source.replace(expected, "sha512-INVALID"),
    source.replace("lockfileVersion: '9.0'", "lockfileVersion: '8.0'"),
  ]) assert.throws(() => inspectFollowRedirectsLock(bad));
});
