import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./new/route.ts", import.meta.url), "utf8");

test("RuoYi 新会话忽略浏览器携带的工具预设并采用角色策略", () => {
  assert.match(source, /if \(!isRuoyiIntegrationEnabled\(\)\) \{/);
  assert.match(source, /浏览器可能带着上一次本地预设；RuoYi 模式必须忽略它/);
  assert.match(source, /toolNames = ruoyiPolicy\.toolNames;/);
  assert.match(source, /forceToolNames: true/);
});
