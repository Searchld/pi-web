import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("RuoYi 会话不请求或展示项目可信任入口", () => {
  assert.match(source, /if \(isRuoyiIntegration \|\| !projectTrustCwd\) return;/);
  assert.match(source, /if \(isRuoyiIntegration \|\| !showChat \|\| !projectTrust\?\.requiresTrust \|\| projectTrust\.trusted\) return null;/);
  assert.match(source, /!isRuoyiIntegration && projectTrustDialogOpen && projectTrustCwd/);
});
