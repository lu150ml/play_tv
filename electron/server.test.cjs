const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");

const { createServer } = require("./server.cjs");

let server;
let baseUrl;
let originalFetch;

beforeEach(async () => {
  originalFetch = global.fetch;
  server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
});

test("forwards Xtream credentials and actions from a JSON POST body", async () => {
  let upstreamUrl;
  global.fetch = async (target) => {
    upstreamUrl = new URL(target);
    return new Response(JSON.stringify({ user_info: { auth: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const response = await postXtream({
    serverUrl: "https://iptv.example/base",
    username: "viewer",
    password: "secret",
    action: "get_series_info",
    params: { series_id: 42, ignored: null }
  });

  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.pathname, "/base/player_api.php");
  assert.equal(upstreamUrl.searchParams.get("username"), "viewer");
  assert.equal(upstreamUrl.searchParams.get("password"), "secret");
  assert.equal(upstreamUrl.searchParams.get("action"), "get_series_info");
  assert.equal(upstreamUrl.searchParams.get("series_id"), "42");
  assert.equal(upstreamUrl.searchParams.has("ignored"), false);
});

test("preserves upstream status and response body", async () => {
  global.fetch = async () => new Response("upstream unavailable", { status: 503 });
  const response = await postXtream(validCredentials());
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "upstream unavailable");
});

test("rejects methods other than POST", async () => {
  const response = await fetch(`${baseUrl}/api/xtream`);
  assert.equal(response.status, 405);
  assert.equal(await response.text(), "Use POST for /api/xtream.");
});

test("rejects invalid JSON", async () => {
  const response = await fetch(`${baseUrl}/api/xtream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid"
  });
  assert.equal(response.status, 502);
  assert.equal(await response.text(), "Invalid JSON body.");
});

test("rejects incomplete credentials", async () => {
  const response = await postXtream({ serverUrl: "https://iptv.example", username: "viewer" });
  assert.equal(response.status, 400);
});

function validCredentials() {
  return { serverUrl: "https://iptv.example", username: "viewer", password: "secret" };
}

function postXtream(body) {
  return originalFetch(`${baseUrl}/api/xtream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
