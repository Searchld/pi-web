import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { readRuoyiAuthorization } = await jiti.import("./ruoyi-identity.ts");

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
