import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";

const MAX_PROMPT_LENGTH = 16_000;

export type RuoyiSystemPromptPreference = {
  enabled: boolean;
  prompt: string;
};

function promptPath(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex");
  return join(getAgentDir(), "pi-web-ruoyi-system-prompt", `${digest}.json`);
}

function parsePreference(value: unknown): RuoyiSystemPromptPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== "boolean" || typeof record.prompt !== "string") return null;
  if (record.prompt.length > MAX_PROMPT_LENGTH) return null;
  return { enabled: record.enabled, prompt: record.prompt };
}

/** 未保存时保持现有受控会话行为：启用固定业务提示词。 */
export function defaultRuoyiSystemPromptPreference(defaultPrompt: string): RuoyiSystemPromptPreference {
  return { enabled: true, prompt: defaultPrompt };
}

export async function readRuoyiSystemPromptPreference(
  userId: string,
  defaultPrompt: string,
): Promise<RuoyiSystemPromptPreference> {
  const path = promptPath(userId);
  if (!existsSync(path)) return defaultRuoyiSystemPromptPreference(defaultPrompt);
  try {
    const parsed = parsePreference(JSON.parse(await readFile(path, "utf8")));
    return parsed ?? defaultRuoyiSystemPromptPreference(defaultPrompt);
  } catch {
    return defaultRuoyiSystemPromptPreference(defaultPrompt);
  }
}

/** 开关关闭时返回 null，让调用方保留 Pi Web 的默认提示词。 */
export async function loadRuoyiSystemPrompt(
  userId: string,
  defaultPrompt: string,
): Promise<string | null> {
  const preference = await readRuoyiSystemPromptPreference(userId, defaultPrompt);
  return preference.enabled ? preference.prompt : null;
}

export function validateRuoyiSystemPromptPreference(value: unknown): RuoyiSystemPromptPreference {
  const parsed = parsePreference(value);
  if (!parsed) {
    throw new Error(`提示词设置无效：需要 enabled 布尔值和不超过 ${MAX_PROMPT_LENGTH} 字符的 prompt`);
  }
  if (parsed.enabled && !parsed.prompt.trim()) {
    throw new Error("启用自定义提示词时不能为空");
  }
  return parsed;
}

/** 每个 RuoYi 用户的提示词独立保存于 Pi 配置目录，工作区内的 Agent 无法改写。 */
export async function writeRuoyiSystemPromptPreference(
  userId: string,
  preference: RuoyiSystemPromptPreference,
): Promise<void> {
  const path = promptPath(userId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (!existsSync(path)) {
    try {
      await writeFile(path, "{}", { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const release = await lockfile.lock(path, { realpath: false, retries: 10 });
  try {
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(preference, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await release();
  }
}
