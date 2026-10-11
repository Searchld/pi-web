import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { translateSystemPromptForDisplay } = await jiti.import("./system-prompt-display.ts");

test("简体中文系统提示词展示会翻译固定说明但保留路径和标记", () => {
  const prompt = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

<tools>
(none)
</tools>

<docs>
Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /tmp/README.md
</docs>`;

  const displayed = translateSystemPromptForDisplay(prompt, "zh-CN");
  assert.match(displayed, /专业编程助手/);
  assert.match(displayed, /（无）/);
  assert.match(displayed, /Pi 文档/);
  assert.match(displayed, /\/tmp\/README\.md/);
  assert.match(displayed, /<tools>/);
  assert.doesNotMatch(displayed, /You are an expert coding assistant/);
});

test("非简体中文界面保留原始提示词", () => {
  const prompt = "You are an expert coding assistant";
  assert.equal(translateSystemPromptForDisplay(prompt, "en"), prompt);
});
