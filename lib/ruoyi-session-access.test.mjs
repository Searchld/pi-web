import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { requireIntegrationSessionAccess } = await jiti.import("./ruoyi-session-access.ts");
const { ruoyiWorkspaceFor } = await jiti.import("./ruoyi-identity.ts");

test("会话访问复用单次策略，后续请求重新校验权限并检查会话归属", async (t) => {
  const previousBaseUrl = process.env.RUOYI_API_BASE_URL;
  const previousSessions = globalThis.__piSessions;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  globalThis.__piSessions = new Map([["session", { isAlive: () => true, cwd: ruoyiWorkspaceFor("1") }]]);
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previousBaseUrl;
    globalThis.__piSessions = previousSessions;
  });
  let userId = 1;
  let chatEnabled = true;
  let policyCalls = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    if (String(input).endsWith("/tool-policy/access")) {
      policyCalls++;
      return Response.json({ code: 200, data: { userId, policy: { chatEnabled, toolNames: ["read"] } } });
    }
    return Response.json({ code: 200, user: { userId }, permissions: [] });
  });
  const request = () => new Request("http://localhost/api/agent/session", {
    headers: { "X-RuoYi-Authorization": "token" },
  });

  const access = await requireIntegrationSessionAccess(request(), "session");
  assert.deepEqual(access.policy.toolNames, ["read"]);
  assert.equal(policyCalls, 1);

  userId = 2;
  assert.equal((await requireIntegrationSessionAccess(request(), "session")).status, 404);
  chatEnabled = false;
  userId = 1;
  assert.equal((await requireIntegrationSessionAccess(request(), "session")).status, 403);
  assert.equal(policyCalls, 3);
});

test("并发用户的令牌、策略和会话归属互不串用", async (t) => {
  const previousBaseUrl = process.env.RUOYI_API_BASE_URL;
  const previousSessions = globalThis.__piSessions;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  globalThis.__piSessions = new Map([
    ["one", { isAlive: () => true, cwd: ruoyiWorkspaceFor("1") }],
    ["two", { isAlive: () => true, cwd: ruoyiWorkspaceFor("2") }],
  ]);
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previousBaseUrl;
    globalThis.__piSessions = previousSessions;
  });
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    const token = new Headers(init.headers).get("Authorization");
    await new Promise((resolve) => setTimeout(resolve, token === "Bearer one" ? 4 : 1));
    const one = token === "Bearer one";
    return Response.json({ code: 200, data: {
      userId: one ? 1 : 2,
      policy: { chatEnabled: true, toolNames: [one ? "read" : "grep"] },
    } });
  });
  const calls = Array.from({ length: 40 }, (_, i) => {
    const one = i % 2 === 0;
    const request = new Request("http://localhost/api/agent/session", {
      headers: { "X-RuoYi-User-Id": "forged", "X-RuoYi-Authorization": one ? "one" : "two" },
    });
    return requireIntegrationSessionAccess(request, one ? "one" : "two");
  });
  const results = await Promise.all(calls);
  for (const [i, access] of results.entries()) {
    assert.equal(access.identity.userId, i % 2 === 0 ? "1" : "2");
    assert.deepEqual(access.policy.toolNames, [i % 2 === 0 ? "read" : "grep"]);
  }
  assert.equal(globalThis.fetch.mock.calls.length, 40);
});

test("令牌失效或身份策略服务不可用时拒绝会话访问", async (t) => {
  const previousBaseUrl = process.env.RUOYI_API_BASE_URL;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previousBaseUrl;
  });
  let response = Response.json({ code: 401 });
  t.mock.method(globalThis, "fetch", async () => response.clone());
  const request = new Request("http://localhost/api/agent/session", {
    headers: { "X-RuoYi-Authorization": "revoked" },
  });
  assert.equal((await requireIntegrationSessionAccess(request, "session")).status, 401);
  response = Response.json({ code: 200, data: { userId: 1 } });
  assert.equal((await requireIntegrationSessionAccess(request, "session")).status, 503);
});
