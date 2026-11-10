import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createJiti } from "jiti";

const root = await mkdtemp(join(tmpdir(), "pi-shared-resources-"));
const agentDir = join(root, "agent");
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const previousRuoyiApi = process.env.RUOYI_API_BASE_URL;
process.env.PI_CODING_AGENT_DIR = agentDir;
process.env.RUOYI_API_BASE_URL = "http://ruoyi.test";
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { listSubagentProfiles } = await jiti.import("./subagents.ts");
const { loadSkillsWithInstallInfo } = await jiti.import("./skills-service.ts");

test.after(async () => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  if (previousRuoyiApi === undefined) delete process.env.RUOYI_API_BASE_URL;
  else process.env.RUOYI_API_BASE_URL = previousRuoyiApi;
  await rm(root, { recursive: true, force: true });
});

test("two user workspaces see the same global skills and agents despite local name collisions", async () => {
  const users = [join(root, "one"), join(root, "two")];
  await mkdir(join(agentDir, "agents"), { recursive: true });
  await mkdir(join(agentDir, "skills", "shared"), { recursive: true });
  await writeFile(join(agentDir, "agents", "shared.md"), "---\nname: shared\ndescription: shared agent\n---\nGlobal prompt");
  await writeFile(join(agentDir, "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: global skill\n---\nGlobal instructions");
  for (const user of users) {
    await mkdir(join(user, ".pi", "agents"), { recursive: true });
    await mkdir(join(user, ".pi", "skills", "shared"), { recursive: true });
    await writeFile(join(user, ".pi", "agents", "shared.md"), "---\nname: shared\ndescription: local agent\n---\nLocal prompt");
    await writeFile(join(user, ".pi", "skills", "shared", "SKILL.md"), "---\nname: shared\ndescription: local skill\n---\nLocal instructions");
    assert.equal(listSubagentProfiles(user).find((p) => p.name === "shared")?.systemPrompt, "Global prompt");
    assert.equal((await loadSkillsWithInstallInfo(user)).skills.find((s) => s.name === "shared")?.description, "global skill");
  }
});
