import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("RuoYi iframe 顶部工具栏请求父窗口拖动和全屏", () => {
  assert.match(source, /qimiao-dialog-drag-start/);
  assert.match(source, /qimiao-dialog-drag-move/);
  assert.match(source, /qimiao-dialog-drag-end/);
  assert.match(source, /qimiao-dialog-toggle-fullscreen/);
  assert.match(source, /screenX: event\.screenX, screenY: event\.screenY/);
  assert.match(source, /Math\.hypot\(event\.clientX - pointer\.startX, event\.clientY - pointer\.startY\) < 4/);
  assert.match(source, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /document\.addEventListener\("dblclick", handleDocumentDoubleClick, true\)/);
  assert.match(source, /document\.removeEventListener\("dblclick", handleDocumentDoubleClick, true\)/);
  assert.match(source, /document\.elementFromPoint\(event\.clientX, event\.clientY\) \?\? event\.target/);
  assert.match(source, /button, a, input, select, textarea, \[role='button'\], \[contenteditable='true'\]/);
  assert.match(source, /isRuoyiToolbarInteractiveElement\(target\)/);
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

test("RuoYi 认证请求中止后允许同一令牌重试", () => {
  assert.match(source, /const currentController = ruoyiAuthAbortRef\.current;/);
  assert.match(source, /token === ruoyiAuthTokenRef\.current && !currentController\?\.signal\.aborted/);
  assert.match(source, /currentController\?\.abort\(\);/);
});

test("RuoYi 认证后可从父窗口提交问题并回传回复正文", () => {
  assert.match(source, /event\.data\?\.type === "qimiao-agent-submit"/);
  assert.match(source, /ruoyiAuthenticatedRef\.current/);
  assert.match(source, /setRuoyiExternalPrompt\(\{ id: ruoyiPromptSequenceRef\.current, text: event\.data\.text\.trim\(\) \}\)/);
  assert.match(source, /qimiao-agent-response-start/);
  assert.match(source, /qimiao-agent-response-delta/);
  assert.match(source, /qimiao-agent-response-end/);
  assert.match(source, /if \(!isHeadlessRuoyi\) digitalHumanRef\.current\?\.start\(\)/);
  assert.match(chatWindowSource, /externalPromptSentRef\.current === externalPrompt\.id/);
  assert.match(chatWindowSource, /void handleSend\(externalPrompt\.text\)/);
});

test("RuoYi 会话统计不展示本机路径和会话标识", () => {
  assert.match(source, /const showSessionDiagnostics = !isRuoyiIntegration;/);
  assert.match(source, /showSessionDiagnostics \? \[/);
  assert.match(source, /const projectRows = showSessionDiagnostics \? \[/);
});

test("RuoYi 会话统计以紧凑双列弹层展示", () => {
  assert.match(source, /width: "min\(560px, 100%\)"/);
  assert.match(source, /marginLeft: "auto"/);
  assert.match(source, /gridTemplateColumns: "minmax\(120px, 0\.65fr\) minmax\(220px, 1\.35fr\)"/);
});

test("桌面会话统计移入输入框控制区，顶栏操作仍靠右", () => {
  assert.match(source, /composerSessionStats=\{isMobile \? undefined : renderSessionStatsButton\(false, "composer"\)\}/);
  assert.match(source, /const renderOpenSessionInNewTab[\s\S]*?marginLeft: mobile \? 0 : "auto"/);
});

test("RuoYi 会话栏展开时把折叠键放在侧栏标题行", () => {
  assert.match(source, /sidebarOpen=\{sidebarOpen\}/);
  assert.match(source, /onToggleSidebar=\{handleSidebarToggle\}/);
  assert.match(source, /\{\(!isRuoyiIntegration \|\| !sidebarOpen\) && <button/);
  assert.match(source, /borderBottom: isRuoyiIntegration && !sidebarOpen \? "3px solid #409eff" : "3px solid transparent"/);
  assert.match(source, /color: sidebarOpen \|\| isRuoyiIntegration \? activeToolbarColor : "var\(--text-muted\)"/);
  assert.match(source, /\{sidebarOpen \? \([\s\S]*?<line x1="9"[\s\S]*?\) : \([\s\S]*?<line x1="15"/);
});

test("RuoYi 文件浏览器在右侧面板并与预览并排", () => {
  assert.match(source, /filesInRightPanel=\{isRuoyiIntegration\}/);
  assert.match(source, /className=\{`ruoyi-file-workbench/);
  assert.match(source, /className="ruoyi-file-viewer"/);
  assert.match(source, /className="ruoyi-file-browser"/);
  assert.match(source, /className="ruoyi-file-panel-title"/);
  assert.match(source, /<FileExplorer/);
  assert.match(source, /const renderMainFileToggle[\s\S]*?<FolderIcon size=\{18\} \/>/);
});

test("RuoYi 打开文件自动展开预览面板", () => {
  assert.match(source, /setRightPanelOpen\(true\);\s*\/\/ RuoYi 的文件树与预览共用右侧栏；打开文件时自动展开，避免预览被树挤出视口。\s*if \(isRuoyiIntegration && !isMobile\) setRightPanelExpanded\(true\);/);
});

test("RuoYi 文件浏览器保留文件操作栏", () => {
  assert.match(source, /const rightFileExplorerRef = useRef<FileExplorerHandle>\(null\)/);
  assert.match(source, /const renderRuoyiFileActions/);
  assert.match(source, /\{isRuoyiIntegration && renderRuoyiFileActions\(\)\}/);
  assert.match(source, /<UploadIcon size=\{15\} \/>/);
  assert.match(source, /<RefreshIcon size=\{15\} \/>/);
  assert.match(source, /<EyeIcon size=\{15\} \/>/);
  assert.match(source, /<ChangesIcon size=\{15\} \/>/);
  assert.match(source, /<SearchIcon size=\{15\} \/>/);
  assert.match(source, /showHidden=\{rightExplorerShowIgnoredFiles\}/);
});

test("RuoYi 打开文件面板时隐藏并在关闭时恢复数字人", () => {
  assert.match(source, /const justOpened = rightPanelOpen && !rightPanelWasOpenRef\.current;/);
  assert.match(source, /const justClosed = !rightPanelOpen && rightPanelWasOpenRef\.current;/);
  assert.match(source, /digitalHumanHiddenByFilePanelRef\.current = digitalHumanOpen;/);
  assert.match(source, /if \(digitalHumanOpen\) setDigitalHumanOpen\(false\);/);
  assert.match(source, /else if \(justClosed && digitalHumanHiddenByFilePanelRef\.current\)/);
  assert.match(source, /setDigitalHumanOpen\(true\);/);
});

test("RuoYi 数字人可记住用户主动隐藏的选择", () => {
  assert.match(source, /ui\.qimiao-web\.digital-human-hidden/);
  assert.match(source, /const updateDigitalHumanVisibility = useCallback/);
  assert.match(source, /JSON\.stringify\(\{ digitalHumanHidden: !open \}\)/);
  assert.match(source, /digitalHumanVisibilityReady && digitalHumanOpen/);
});

test("RuoYi 已完成回答可唤起数字人手动播报", () => {
  assert.match(source, /const handleSpeakAnswer = useCallback/);
  assert.match(source, /digitalHumanRef\.current\?\.speakAnswer\(text\)/);
  assert.match(source, /pendingDigitalHumanSpeechRef\.current = text/);
  assert.match(source, /const handleDigitalHumanReady = useCallback/);
  assert.match(source, /onReady=\{handleDigitalHumanReady\}/);
  assert.match(source, /onSpeakAnswer=\{isRuoyiIntegration \? handleSpeakAnswer : undefined\}/);
});

test("RuoYi 浏览器标题随当前会话切换，并使用 Web Agent 标识", () => {
  assert.match(source, /const selectedSessionTitle = selectedSession\?\.name\?\.trim\(\) \|\| selectedSession\?\.firstMessage\.trim\(\);/);
  assert.match(source, /`\$\{selectedSessionTitle\.slice\(0, 60\)\} · Web Agent`/);
  assert.match(source, /: "Web Agent"/);
});
