import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { localizeToolDefinition } = await jiti.import("./tool-definition-localization.ts");

const zh = (key) => ({
  "tools.builtin.read.name": "读取文件",
  "tools.builtin.read.description": "读取文件内容。",
  "tools.builtin.read.path": "要读取的文件路径",
  "tools.builtin.read.offset": "开始读取的行号",
  "tools.builtin.read.limit": "最多读取的行数",
  "tools.builtin.read.guideline1": "查看文件请使用 read。",
  "tools.type.string": "字符串",
  "tools.type.number": "数值",
  "tools.type.unknown": "未知",
}[key] ?? key);

test("localizes built-in tool definitions only for the Tool panel", () => {
  const source = {
    name: "read",
    label: "read",
    description: "Read the contents of a file.",
    active: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read" },
        offset: { type: "number", description: "Line number" },
      },
    },
    promptGuidelines: ["Use read."],
  };

  const localized = localizeToolDefinition(source, zh);
  assert.equal(localized.displayName, "读取文件");
  assert.equal(localized.description, "读取文件内容。");
  assert.equal(localized.parameters.properties.path.description, "要读取的文件路径");
  assert.deepEqual(localized.promptGuidelines, ["查看文件请使用 read。"]);
  assert.equal(source.description, "Read the contents of a file.");
  assert.equal(source.parameters.properties.path.description, "Path to the file to read");
});

test("keeps an extension tool's supplied Chinese display name and definition", () => {
  const source = {
    name: "system_business_query_alerts",
    label: "查询预警",
    description: "查询当前用户的预警数据。",
    active: true,
  };
  const localized = localizeToolDefinition(source, zh);
  assert.equal(localized.displayName, "查询预警");
  assert.equal(localized.description, source.description);
});
