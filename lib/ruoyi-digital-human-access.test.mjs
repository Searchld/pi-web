import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { requireRuoyiDigitalHumanAccess } = await jiti.import("./ruoyi-access.ts");

test("数字人需要聊天和独立数字人权限，服务异常时拒绝", async (t) => {
  const old = process.env.RUOYI_API_BASE_URL;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  t.after(() => { if (old === undefined) delete process.env.RUOYI_API_BASE_URL; else process.env.RUOYI_API_BASE_URL = old; });
  let policy = { chatEnabled: true, digitalHumanEnabled: false };
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 200, data: { userId: 2, policy } }));
  const request = new Request("http://localhost/api/ruoyi-digital-human", { headers: { "X-RuoYi-Authorization": "token" } });
  assert.equal((await requireRuoyiDigitalHumanAccess(request)).status, 403);
  policy = { chatEnabled: false, digitalHumanEnabled: true };
  assert.equal((await requireRuoyiDigitalHumanAccess(request)).status, 403);
  policy = { chatEnabled: true, digitalHumanEnabled: true };
  assert.equal((await requireRuoyiDigitalHumanAccess(request)).identity.userId, "2");
  policy = { chatEnabled: true };
  assert.equal((await requireRuoyiDigitalHumanAccess(request)).status, 403);
});
