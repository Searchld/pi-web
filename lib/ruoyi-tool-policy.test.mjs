import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { normalizeRuoyiAgentPolicy } = await jiti.import("./ruoyi-tool-policy.ts");

test("RuoYi 策略只接受已知内置工具、技能、设置页与业务/子 Agent 开关", () => {
  assert.deepEqual(normalizeRuoyiAgentPolicy({ data: {
    chatEnabled: true,
    toolNames: ["read", "bash", "read", "unexpected"],
    businessToolsEnabled: true,
    subagentToolNames: ["Agent", "steer_subagent", "unknown"],
    settingsSections: ["general", "models", "agents", "unknown"],
    skillNames: ["figma", "agent-browser", "figma", "unknown"],
  } }), {
    chatEnabled: true,
    toolNames: ["read", "bash"],
    businessToolsEnabled: true,
    subagentToolNames: ["Agent", "steer_subagent"],
    settingsSections: ["general", "models", "agents"],
    skillNames: ["figma", "agent-browser"],
  });
});

test("损坏的 RuoYi 策略默认为全部关闭", () => {
  assert.deepEqual(normalizeRuoyiAgentPolicy({ data: { toolNames: "read" } }), {
    chatEnabled: false,
    toolNames: [],
    businessToolsEnabled: false,
    subagentToolNames: [],
    settingsSections: [],
    skillNames: [],
  });
});
