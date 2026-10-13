import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");

test("RuoYi 固定工作目录时不请求主目录或 worktree", () => {
  assert.match(source, /if \(hideWorkspacePicker\) return;\s*fetch\("\/api\/home"\)/s);
  assert.match(source, /if \(hideWorkspacePicker\) \{\s*setWorktreeState\(null\);\s*setWorktreeLoadingCwd\(null\);\s*return;\s*\}/s);
  assert.match(source, /\[hideWorkspacePicker, selectedCwd, wtRefreshKey, refreshKey\]/);
});
