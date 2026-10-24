import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createDestructiveCommandGuard, isBlockedDestructiveCommand } = await jiti.import("./destructive-command-guard.ts");

test("阻断 rm 的递归强制删除及其常见包装写法", () => {
  for (const command of [
    "rm -rf build",
    "rm -fr build",
    "rm -r -f build",
    "rm --force --recursive build",
    "/bin/rm -Rf build",
    "sudo -n rm -rf build",
    "env MODE=clean rm -rf build",
    "cd build && rm -rf output",
    "bash -c 'rm -rf build'",
  ]) {
    assert.equal(isBlockedDestructiveCommand(command), true, command);
  }
});

test("不拦截非递归强制删除或仅提及命令的文本", () => {
  for (const command of ["rm -f file", "rm -r directory", "echo 'rm -rf build'", "printf '%s\\n' rm -rf"]) {
    assert.equal(isBlockedDestructiveCommand(command), false, command);
  }
});

test("工具调用钩子仅阻断 bash 的危险删除", () => {
  let handler;
  createDestructiveCommandGuard().factory({
    on(name, listener) {
      if (name === "tool_call") handler = listener;
    },
  });

  assert.equal(handler({ toolName: "bash", input: { command: "rm -rf /tmp/example" } }).block, true);
  assert.equal(handler({ toolName: "bash", input: { command: "rm -f file" } }), undefined);
  assert.equal(handler({ toolName: "powershell", input: { command: "Remove-Item -Recurse -Force file" } }), undefined);
});
