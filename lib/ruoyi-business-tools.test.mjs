import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  BUSINESS_AGENT_TOOL_PREFIX,
  createRuoyiBusinessToolsExtension,
  formatBusinessToolResult,
  isBusinessAgentToolName,
  normalizeBusinessTools,
} = await createJiti(import.meta.url).import("./ruoyi-business-tools.ts");

test("RuoYi 业务工具只接受安全且不重复的目录项", () => {
  assert.deepEqual(normalizeBusinessTools({ code: 200, data: [
    { name: "production_summary", displayName: "生产汇总", description: "查询生产汇总" },
    { name: "production_summary", displayName: "重复", description: "不应注册" },
    { name: "../bash", displayName: "非法", description: "不应注册" },
    { name: "empty_description", displayName: "无说明", description: " " },
  ] }), [{ name: "production_summary", displayName: "生产汇总", description: "查询生产汇总" }]);
  assert.equal(isBusinessAgentToolName(`${BUSINESS_AGENT_TOOL_PREFIX}production_summary`), true);
  assert.equal(isBusinessAgentToolName(`${BUSINESS_AGENT_TOOL_PREFIX}../bash`), false);
});

test("优先传递服务端已格式化的业务结果，避免模型处理原始字段", () => {
  const result = formatBusinessToolResult({
    code: 200,
    data: {
      content: "{\"internalCount\":3}",
      formattedContent: "## 生产汇总\n\n- 本日：3 条",
    },
  });
  assert.match(result, /系统已校验并格式化/);
  assert.match(result, /本日：3 条/);
  assert.doesNotMatch(result, /internalCount/);
});

test("业务工具目录和执行都使用当前内存中的 RuoYi 令牌", async () => {
  const originalBaseUrl = process.env.RUOYI_API_BASE_URL;
  const originalFetch = globalThis.fetch;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  const requests = [];
  let authorization = "Bearer first-token";
  let registeredTool;
  let loadedTools;
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      authorization: new Headers(init.headers).get("Authorization"),
      body: init.body,
    });
    const isCatalog = String(url).endsWith("/agent/v1/business-tools");
    return new Response(JSON.stringify(isCatalog
      ? { code: 200, data: [{ name: "production_summary", displayName: "生产汇总", description: "查询生产汇总" }] }
      : { code: 200, data: { formattedContent: "生产汇总结果" } }), { status: 200 });
  };

  try {
    await createRuoyiBusinessToolsExtension(() => authorization, (tools) => { loadedTools = tools; }).factory({
      registerTool(tool) { registeredTool = tool; },
    });
    authorization = "Bearer refreshed-token";
    await registeredTool.execute("call-1", { query: "今天生产情况" });

    assert.equal(requests[0].authorization, "Bearer first-token");
    assert.deepEqual(loadedTools, [{ name: "production_summary", displayName: "生产汇总", description: "查询生产汇总" }]);
    assert.equal(requests[1].authorization, "Bearer refreshed-token");
    assert.equal(requests[1].body, JSON.stringify({ toolName: "production_summary", query: "今天生产情况" }));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.RUOYI_API_BASE_URL;
    else process.env.RUOYI_API_BASE_URL = originalBaseUrl;
  }
});
