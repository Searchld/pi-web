import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const root = await mkdtemp(join(tmpdir(), "pi-web-ruoyi-workspace-trust-"));
const agentDir = join(root, "agent");
const previousCwd = process.cwd();
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousRuoyiApi = process.env.RUOYI_API_BASE_URL;
const previousFetch = globalThis.fetch;
process.chdir(root);
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
globalThis.fetch = async () => new Response(JSON.stringify({
  code: 200,
  user: { userId: 42 },
  permissions: [],
}), { status: 200, headers: { "Content-Type": "application/json" } });

const jiti = createJiti(import.meta.url);
const { ruoyiWorkspaceFor } = await jiti.import("./ruoyi-identity.ts");
const { trustVerifiedRuoyiWorkspace } = await jiti.import("./ruoyi-settings-access.ts");

test.after(async () => {
  process.chdir(previousCwd);
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousRuoyiApi === undefined) delete process.env.RUOYI_API_BASE_URL;
  else process.env.RUOYI_API_BASE_URL = previousRuoyiApi;
  globalThis.fetch = previousFetch;
  await rm(root, { recursive: true, force: true });
});

function request() {
  return new Request("http://localhost/api/skills", {
    headers: { "x-ruoyi-authorization": "token" },
  });
}

test("only the verified RuoYi user's fixed workspace receives default trust", async () => {
  const workspace = ruoyiWorkspaceFor("42");
  const other = join(root, "other");
  await Promise.all([mkdir(workspace, { recursive: true }), mkdir(other, { recursive: true })]);

  assert.equal(await trustVerifiedRuoyiWorkspace(request(), workspace), null);
  const store = new ProjectTrustStore(agentDir);
  assert.equal(store.get(workspace), true);

  const denied = await trustVerifiedRuoyiWorkspace(request(), other);
  assert.equal(denied?.status, 403);
  assert.equal(store.get(other), null);
});
