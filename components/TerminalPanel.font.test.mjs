import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./TerminalPanel.tsx", import.meta.url), "utf8");

test("终端不继承业务正文的比例字体", () => {
  assert.match(source, /const TERMINAL_FONT_FAMILY = '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';/);
  assert.match(source, /fontFamily: TERMINAL_FONT_FAMILY,/);
  assert.doesNotMatch(source, /subscribeFontPreferences/);
});
