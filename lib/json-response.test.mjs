import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { jsonResponse } = await jiti.import("./json-response.ts");

test("JSON 响应保留调用方设置的标头", async () => {
  const response = jsonResponse({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
});

test("大 JSON 经 Next.js 发送后仍可由浏览器解析", async (t) => {
  const { createServer } = await import("node:http");
  const { NodeNextResponse } = await import("next/dist/server/base-http/node.js");
  const { sendResponse } = await import("next/dist/server/send-response.js");
  const value = "会话内容".repeat(500);
  const server = createServer((req, res) => {
    void sendResponse(req, new NodeNextResponse(res), jsonResponse({ value }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/test`);
  assert.deepEqual(await response.json(), { value });
});
