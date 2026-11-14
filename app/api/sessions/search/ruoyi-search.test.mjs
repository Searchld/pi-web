import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { GET } = await jiti.import("./route.ts");
const { ruoyiWorkspaceFor } = await jiti.import("../../../../lib/ruoyi-identity.ts");
const { invalidateSessionListCache } = await jiti.import("../../../../lib/session-reader.ts");

test("若依搜索只返回当前用户的侧聊，且不重复侧聊继承的历史", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-ruoyi-search-"));
  const beforeDir = process.env.PI_CODING_AGENT_DIR;
  const beforeUrl = process.env.RUOYI_API_BASE_URL;
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
  invalidateSessionListCache();
  t.after(async () => {
    if (beforeDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = beforeDir;
    if (beforeUrl === undefined) delete process.env.RUOYI_API_BASE_URL; else process.env.RUOYI_API_BASE_URL = beforeUrl;
    invalidateSessionListCache();
    await rm(root, { recursive: true, force: true });
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 200, data: { userId: 1, policy: { chatEnabled: true } } }));
  const timestamp = "2026-11-14T00:00:00.000Z";
  for (const userId of ["1", "2"]) {
    const dir = join(root, "sessions", `user-${userId}`);
    await mkdir(dir, { recursive: true });
    const cwd = ruoyiWorkspaceFor(userId);
    const parent = `00000000-0000-4000-8000-00000000000${userId}`;
    const side = `00000000-0000-4000-9000-00000000000${userId}`;
    const header = (id) => ({ type: "session", version: 3, id, timestamp, cwd });
    const message = (id, text) => ({ type: "message", id, parentId: null, timestamp, message: { role: "user", content: text, timestamp: Date.parse(timestamp) } });
    await writeFile(join(dir, `parent-${userId}.jsonl`), [header(parent), message("first", "inherited phrase")].map(JSON.stringify).join("\n") + "\n");
    await writeFile(join(dir, `side-${userId}.jsonl`), [{ ...header(side), parentSession: join(dir, `parent-${userId}.jsonl`) }, { type: "custom", customType: "pi-web:side", id: "side-meta", parentId: null, timestamp, data: { version: 1, parentSessionId: parent, createdAt: timestamp } }, message("inherited", "inherited phrase"), { type: "custom_message", customType: "pi-web:side-boundary", id: "boundary", parentId: null, timestamp, content: "boundary", display: false }, message("own", "unique side question")].map(JSON.stringify).join("\n") + "\n");
  }
  const search = async (q) => {
    const response = await GET(new Request(`http://localhost/api/sessions/search?q=${encodeURIComponent(q)}`, { headers: { "X-RuoYi-Authorization": "token" } }));
    assert.equal(response.status, 200);
    return (await response.json()).results;
  };
  const results = await search("unique side question");
  assert.equal(results.length, 1);
  assert.equal(results[0].session.cwd, ruoyiWorkspaceFor("1"));
  assert.equal(results[0].session.relation.kind, "side");
  assert.equal(results[0].entryId, "own");
  const inherited = await search("inherited phrase");
  assert.equal(inherited.length, 1);
  assert.equal(inherited[0].session.relation?.kind, undefined);
});
