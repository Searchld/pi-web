import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createRuoyiWorkspaceToolGuard } = await jiti.import("./ruoyi-workspace-tool-guard.ts");

function guardFor(workspace, allowedSkillFiles) {
  let handler;
  createRuoyiWorkspaceToolGuard(workspace, allowedSkillFiles).factory({
    on(name, listener) {
      if (name === "tool_call") handler = listener;
    },
  });
  return handler;
}

test("RuoYi 文件工具只能访问当前工作区，且拒绝符号链接逃逸", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-ruoyi-root-"));
  const outside = await mkdtemp(join(tmpdir(), "pi-web-ruoyi-outside-"));
  try {
    await writeFile(join(root, "inside.txt"), "inside");
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "outside"));
    const guard = guardFor(root);

    assert.equal(guard({ toolName: "read", input: { path: "inside.txt" } }), undefined);
    assert.equal(guard({ toolName: "write", input: { path: "new.txt" } }), undefined);
    assert.equal(guard({ toolName: "read", input: { path: join(outside, "secret.txt") } }).block, true);
    assert.equal(guard({ toolName: "read", input: { path: "outside/secret.txt" } }).block, true);
    assert.equal(guard({ toolName: "write", input: { path: "../escaped.txt" } }).block, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("RuoYi 只允许读取角色已授权且加载的技能文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-ruoyi-root-"));
  const skills = await mkdtemp(join(tmpdir(), "pi-web-ruoyi-skills-"));
  try {
    const allowed = join(skills, "allowed.md");
    const denied = join(skills, "denied.md");
    await writeFile(allowed, "allowed");
    await writeFile(denied, "denied");
    const guard = guardFor(root, new Set([await realpath(allowed)]));

    assert.equal(guard({ toolName: "read", input: { path: allowed } }), undefined);
    assert.equal(guard({ toolName: "read", input: { path: denied } }).block, true);
    assert.equal(guard({ toolName: "edit", input: { path: allowed } }).block, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(skills, { recursive: true, force: true });
  }
});
