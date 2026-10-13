import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("数字人偏好接口沿用 RuoYi Agent 聊天权限且不向浏览器返回令牌", () => {
  assert.match(source, /requireRuoyiChatAccess\(request\)/);
  assert.match(source, /Authorization: access\.identity\.authorization/);
  assert.match(source, /system\/user-ui/);
  assert.match(source, /NextResponse\.json\(\{ settings/);
});
