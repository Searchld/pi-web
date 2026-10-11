import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  "app/api/terminal/route.ts",
  "app/api/terminal/[id]/route.ts",
  "app/api/terminal/[id]/events/route.ts",
];

test("RuoYi 模式的全部终端入口都先校验 bash 权限与终端归属", async () => {
  for (const route of routes) {
    const source = await readFile(route, "utf8");
    assert.match(source, /requireRuoyiTerminalOwnerAccess/);
    if (route.includes("[id]")) assert.match(source, /isTerminalOwnedBy/);
    else assert.match(source, /access\?\.identity\.userId/);
  }
});
