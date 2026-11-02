import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { NextRequest } from "next/server.js";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { proxy } = await jiti.import("../proxy.ts");
const workspace = await jiti.import("../app/api/ruoyi-workspace/route.ts");
const lease = await jiti.import("../app/api/agent/[id]/lease/route.ts");
const sessions = await jiti.import("../app/api/sessions/route.ts");
const { ruoyiWorkspaceFor } = await jiti.import("./ruoyi-identity.ts");

test("高频路由在路由内验证令牌，其他接口仍由统一入口验证", async (t) => {
  const previous = process.env.RUOYI_API_BASE_URL;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  t.after(() => {
    if (previous === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previous;
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 401 }));
  const request = (path, token) => new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { host: "localhost", ...(token ? { "X-RuoYi-Authorization": token } : {}) },
  });
  const workspaceRequest = request("/api/ruoyi-workspace", "invalid");
  assert.equal((await proxy(workspaceRequest)).headers.get("x-middleware-next"), "1");
  assert.equal((await workspace.POST(workspaceRequest)).status, 401);
  const leaseRequest = request("/api/agent/00000000-0000-0000-0000-000000000001/lease");
  assert.equal((await proxy(leaseRequest)).headers.get("x-middleware-next"), "1");
  assert.equal((await lease.POST(leaseRequest, { params: Promise.resolve({ id: "session" }) })).status, 401);
  assert.equal((await proxy(request("/api/sessions", "invalid"))).status, 401);
  const debugRequest = new NextRequest("http://localhost/api/agent/debug", { headers: { host: "localhost" } });
  assert.equal((await proxy(debugRequest)).status, 401);
  const sessionsRequest = new NextRequest("http://localhost/api/sessions", { headers: { host: "localhost" } });
  assert.equal((await proxy(sessionsRequest)).headers.get("x-middleware-next"), "1");
  assert.equal((await sessions.GET(sessionsRequest)).status, 401);
});

test("受保护会话续期只向 RuoYi 请求一次身份和策略", async (t) => {
  const previous = process.env.RUOYI_API_BASE_URL;
  const previousSessions = globalThis.__piSessions;
  const sessionId = "00000000-0000-0000-0000-000000000001";
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  globalThis.__piSessions = new Map([[sessionId, {
    cwd: ruoyiWorkspaceFor("1"), isAlive: () => true, renewIdleTimer: () => {},
    isRunning: () => false, isAwaitingInput: () => false,
  }]]);
  t.after(() => {
    if (previous === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previous;
    globalThis.__piSessions = previousSessions;
  });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "http://ruoyi.test/agent/v1/tool-policy/access");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer token");
    return Response.json({ code: 200, data: { userId: 1, policy: { chatEnabled: true } } });
  });
  const request = new NextRequest(`http://localhost/api/agent/${sessionId}/lease`, {
    method: "POST", headers: { host: "localhost", "X-RuoYi-Authorization": "token" },
  });
  assert.equal((await proxy(request)).headers.get("x-middleware-next"), "1");
  assert.equal((await lease.POST(request, { params: Promise.resolve({ id: sessionId }) })).status, 200);
  assert.equal(globalThis.fetch.mock.calls.length, 1);
});
