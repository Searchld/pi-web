import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script, createContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("AppShell.tsx", await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(source);
function compile(text) {
  return new Script(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText);
}
function setup(mobile, hidden = false, allowed = true) {
  const effect = nodes.find((node) => ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes('fetch("/api/ruoyi-digital-human"'));
  const update = nodes.find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === "updateDigitalHumanVisibility");
  assert.ok(effect); assert.ok(update);
  const state = { open: false, ready: false, allowed: false, requests: [] };
  const context = createContext({
    isRuoyiIntegration: true, isRuoyiAuthenticated: true, isMobile: mobile,
    window: { matchMedia: () => ({ matches: mobile }) },
    rightPanelOpenRef: { current: false }, digitalHumanHiddenByFilePanelRef: { current: false },
    digitalHumanVisibilitySavingRef: { current: false },
    setDigitalHumanOpen: (value) => { state.open = value; },
    setDigitalHumanVisibilityReady: (value) => { state.ready = value; },
    setDigitalHumanAllowed: (value) => { state.allowed = value; },
    fetch: async (_url, options) => {
      state.requests.push(options?.method ?? "GET");
      return { ok: allowed, json: async () => ({ settings: { "ui.qimiao-web.digital-human-hidden": String(hidden) } }) };
    },
  });
  return {
    state,
    async open() {
      compile(`(${effect.arguments[0].getText(source)})()`).runInContext(context);
      await new Promise((resolve) => setImmediate(resolve));
    },
    async toggle(open) {
      context.digitalHumanVisibilityReady = state.ready;
      context.digitalHumanAllowed = state.allowed;
      context.digitalHumanOpen = state.open;
      context.open = open;
      await compile(`(${update.initializer.arguments[0].getText(source)})(open)`).runInContext(context);
    },
  };
}

test("手机打开默认关闭，手动开启不修改桌面偏好", async () => {
  const mobile = setup(true);
  await mobile.open();
  assert.equal(mobile.state.ready, true);
  assert.equal(mobile.state.open, false);
  await mobile.toggle(true);
  assert.equal(mobile.state.open, true);
  assert.deepEqual(mobile.state.requests, ["GET"]);
});

test("无数字人权限时，桌面和手机均不得打开面板", async () => {
  for (const mobile of [false, true]) {
    const denied = setup(mobile, false, false);
    await denied.open();
    assert.equal(denied.state.allowed, false);
    assert.equal(denied.state.open, false);
    await denied.toggle(true);
    assert.equal(denied.state.open, false);
    assert.deepEqual(denied.state.requests, ["GET"]);
  }
});

test("电脑端继续读取和保存账号偏好", async () => {
  const desktop = setup(false, true);
  await desktop.open();
  assert.equal(desktop.state.open, false);
  await desktop.toggle(true);
  assert.equal(desktop.state.open, true);
  assert.deepEqual(desktop.state.requests, ["GET", "PUT"]);
});
