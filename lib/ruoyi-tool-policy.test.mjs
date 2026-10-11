import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { normalizeRuoyiAgentPolicy } = await jiti.import("./ruoyi-tool-policy.ts");

test("RuoYi 策略只接受已知内置工具，业务与子 Agent 开关单独保留", () => {
  assert.deepEqual(normalizeRuoyiAgentPolicy({ data: {
    chatEnabled: true,
    toolNames: ["read", "bash", "read", "unexpected"],
    businessToolsEnabled: true,
    subagentToolNames: ["Agent", "steer_subagent", "unknown"],
    settingsSections: ["general", "agents", "unknown"],
  } }), {
    chatEnabled: true,
    toolNames: ["read", "bash"],
    businessToolsEnabled: true,
    subagentToolNames: ["Agent", "steer_subagent"],
    settingsSections: ["general", "agents"],
    modelPolicy: { modelManaged: true, models: [], defaultModelCode: null, maxInputTokens: 0, maxOutputTokens: 0, maxModelCalls: 0, policyVersion: "none", quota: { dailyTokens: 0, monthlyTokens: 0, dailyCostMicros: 0, monthlyCostMicros: 0, dailyTokensRemaining: 0, monthlyTokensRemaining: 0, dailyCostMicrosRemaining: 0, monthlyCostMicrosRemaining: 0 } },
  });
});

test("损坏的 RuoYi 策略默认为全部关闭", () => {
  assert.deepEqual(normalizeRuoyiAgentPolicy({ data: { toolNames: "read" } }), {
    chatEnabled: false,
    toolNames: [],
    businessToolsEnabled: false,
    subagentToolNames: [],
    settingsSections: [],
    modelPolicy: { modelManaged: true, models: [], defaultModelCode: null, maxInputTokens: 0, maxOutputTokens: 0, maxModelCalls: 0, policyVersion: "none", quota: { dailyTokens: 0, monthlyTokens: 0, dailyCostMicros: 0, monthlyCostMicros: 0, dailyTokensRemaining: 0, monthlyTokensRemaining: 0, dailyCostMicrosRemaining: 0, monthlyCostMicrosRemaining: 0 } },
  });
});
