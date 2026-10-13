import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("RuoYi iframe 顶部工具栏请求父窗口拖动和全屏", () => {
  assert.match(source, /qimiao-dialog-drag-start/);
  assert.match(source, /qimiao-dialog-drag-move/);
  assert.match(source, /qimiao-dialog-drag-end/);
  assert.match(source, /qimiao-dialog-toggle-fullscreen/);
  assert.match(source, /Math\.hypot\(event\.clientX - pointer\.startX, event\.clientY - pointer\.startY\) < 4/);
  assert.match(source, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /document\.addEventListener\("dblclick", handleDocumentDoubleClick, true\)/);
  assert.match(source, /document\.removeEventListener\("dblclick", handleDocumentDoubleClick, true\)/);
  assert.match(source, /document\.elementFromPoint\(event\.clientX, event\.clientY\) \?\? event\.target/);
  assert.match(source, /\.qm-art-topbar, \.session-sidebar\.is-ruoyi-embedded \.sidebar-header, \.digital-human-panel__header/);
  assert.match(source, /ruoyiParentOriginRef\.current = event\.origin/);
  assert.match(source, /window\.parent\.postMessage\(message, origin\)/);
  assert.match(source, /if \(!isRuoyiIntegration && !isEmbeddedRuoyi\) return;/);
  assert.doesNotMatch(source, /RUOYI_EMBED_ORIGINS\.forEach\(\(origin\) => window\.parent\.postMessage/);
  assert.doesNotMatch(source, /if \(!isEmbeddedRuoyi \|\| window\.parent === window\) return;/);
});

test("RuoYi 工作区校验期间不暴露工作区路径", () => {
  assert.match(source, /isRuoyiIntegration \? "正在验证当前账号…" : translate\("workspace\.opening"\)/);
  assert.match(source, /!isRuoyiIntegration && \(/);
});
