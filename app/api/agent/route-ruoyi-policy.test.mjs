import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");

test("RuoYi 会话在每次请求读取策略，并拒绝 Pi Web 改写工具集", () => {
  assert.match(source, /const ruoyiPolicy = access \? await loadRuoyiAgentPolicy\(access\.identity\) : undefined/);
  assert.match(source, /if \(access\) throw new RuoyiToolAuthorizationError\("Agent 工具由系统权限统一管理"\)/);
  assert.match(source, /existing\.setRuoyiPolicy\(ruoyiPolicy!\)/);
  assert.match(source, /sameRuoyiCodingToolNames\(existing\.getActiveCodingToolNames\(\), ruoyiPolicy!\.toolNames\)/);
});
