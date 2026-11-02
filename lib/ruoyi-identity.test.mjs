import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { readRuoyiAuthorization, resolveRuoyiIdentityByAuthorization } = await jiti.import("./ruoyi-identity.ts");

test("服务端 Agent 委托凭据保留独立认证方案", () => {
  const request = new Request("http://localhost/api/ruoyi-channel/chat", {
    headers: { Authorization: "Agent short-lived-token" },
  });
  assert.equal(readRuoyiAuthorization(request), "Agent short-lived-token");
});

test("浏览器交换的裸令牌仍按 Bearer 处理", () => {
  const request = new Request("http://localhost/api/agent/new", {
    headers: { "x-ruoyi-authorization": "browser-token" },
  });
  assert.equal(readRuoyiAuthorization(request), "Bearer browser-token");
});

test("令牌撤销后下一次身份校验立即失败", async (t) => {
  const previousUrl = process.env.RUOYI_API_BASE_URL;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = previousUrl;
  });
  let valid = true;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(
    valid ? { code: 200, user: { userId: 1 }, permissions: [] } : { code: 401 },
  ), { status: valid ? 200 : 401 }));
  assert.equal((await resolveRuoyiIdentityByAuthorization("Bearer test-token")).ok, true);
  valid = false;
  assert.equal((await resolveRuoyiIdentityByAuthorization("Bearer test-token")).ok, false);
  assert.equal(globalThis.fetch.mock.calls.length, 2);
});
