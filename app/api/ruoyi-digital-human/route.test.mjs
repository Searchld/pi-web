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

test("数字人偏好仅写入当前账号的白名单键", () => {
  assert.match(source, /export async function PUT\(request: Request\)/);
  assert.match(source, /isApiRequestAllowed\(request\)/);
  assert.match(source, /hasJsonContentType\(request\)/);
  assert.match(source, /const VOICE_ENABLED_KEY = "ui\.console-pet\.voice-enabled"/);
  assert.match(source, /const DIGITAL_HUMAN_HIDDEN_KEY = "ui\.qimiao-web\.digital-human-hidden"/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /voiceEnabled must be a boolean/);
  assert.match(source, /digitalHumanHidden must be a boolean/);
});
