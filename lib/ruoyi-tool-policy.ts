import type { RuoyiIdentity } from "./ruoyi-identity";

/** RuoYi 只可下发 Pi 内置编码工具，不能借配置远程开启任意扩展。 */
export const RUOYI_CODING_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
export const RUOYI_SUBAGENT_TOOL_NAMES = ["Agent", "get_subagent_result", "steer_subagent"] as const;
export const RUOYI_SETTINGS_SECTION_NAMES = ["general", "models", "skills", "agents", "plugins", "mcp"] as const;
/** 企业会话只允许 RuoYi 明确授权的已审核技能，不能由远端任意命名开启本机文件。 */
export const RUOYI_SKILL_NAMES = ["agent-browser", "figma", "find-skills", "frontend-design", "reverse-engineer-anything"] as const;

const codingToolNameSet = new Set<string>(RUOYI_CODING_TOOL_NAMES);
const subagentToolNameSet = new Set<string>(RUOYI_SUBAGENT_TOOL_NAMES);
const settingsSectionNameSet = new Set<string>(RUOYI_SETTINGS_SECTION_NAMES);
const skillNameSet = new Set<string>(RUOYI_SKILL_NAMES);
const POLICY_TIMEOUT_MS = 5_000;

export type RuoyiAgentPolicy = {
  chatEnabled: boolean;
  toolNames: string[];
  businessToolsEnabled: boolean;
  subagentToolNames: string[];
  settingsSections: string[];
  skillNames: string[];
};

export class RuoyiToolAuthorizationError extends Error {}

function baseUrl(): string {
  const value = process.env.RUOYI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new RuoyiToolAuthorizationError("RUOYI_API_BASE_URL 未配置");
  return value;
}

function stringNames(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (typeof item !== "string" || !allowed.has(item) || seen.has(item)) return [];
    seen.add(item);
    return [item];
  });
}

/** 只接受 RuoYi 已按当前用户计算过的白名单，拒绝陌生工具名。 */
export function normalizeRuoyiAgentPolicy(payload: unknown): RuoyiAgentPolicy {
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : payload;
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    chatEnabled: record.chatEnabled === true,
    toolNames: stringNames(record.toolNames, codingToolNameSet),
    businessToolsEnabled: record.businessToolsEnabled === true,
    subagentToolNames: stringNames(record.subagentToolNames, subagentToolNameSet),
    settingsSections: stringNames(record.settingsSections, settingsSectionNameSet),
    skillNames: stringNames(record.skillNames, skillNameSet),
  };
}

/** 每次创建、恢复或提交会话前向 RuoYi 获取当前用户的实际可用清单。 */
export async function loadRuoyiAgentPolicy(identity: RuoyiIdentity): Promise<RuoyiAgentPolicy> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/agent/v1/tool-policy`, {
      headers: { Authorization: identity.authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(POLICY_TIMEOUT_MS),
    });
  } catch {
    throw new RuoyiToolAuthorizationError("无法连接 RuoYi Agent 权限服务");
  }
  const payload = await response.json().catch(() => null) as { code?: unknown; msg?: unknown } | null;
  if (!response.ok || Number(payload?.code) !== 200) {
    throw new RuoyiToolAuthorizationError(typeof payload?.msg === "string" ? payload.msg : "读取 RuoYi Agent 权限失败");
  }
  return normalizeRuoyiAgentPolicy(payload);
}

export function sameRuoyiCodingToolNames(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name) => right.includes(name));
}

export function sameRuoyiSkillNames(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && left.length === right.length && left.every((name) => right.includes(name));
}
