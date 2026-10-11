import type { RuoyiIdentity } from "./ruoyi-identity";

/** RuoYi 只可下发 Pi 内置编码工具，不能借配置远程开启任意扩展。 */
export const RUOYI_CODING_TOOL_NAMES = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
export const RUOYI_SUBAGENT_TOOL_NAMES = ["Agent", "get_subagent_result", "steer_subagent"] as const;
export const RUOYI_SETTINGS_SECTION_NAMES = ["general", "models", "skills", "agents", "plugins", "mcp"] as const;

const codingToolNameSet = new Set<string>(RUOYI_CODING_TOOL_NAMES);
const subagentToolNameSet = new Set<string>(RUOYI_SUBAGENT_TOOL_NAMES);
const settingsSectionNameSet = new Set<string>(RUOYI_SETTINGS_SECTION_NAMES);
const POLICY_TIMEOUT_MS = 5_000;

export type RuoyiAgentPolicy = {
  chatEnabled: boolean;
  toolNames: string[];
  businessToolsEnabled: boolean;
  subagentToolNames: string[];
  settingsSections: string[];
  modelPolicy: RuoyiModelPolicy;
};

export type RuoyiModelPolicy = {
  modelManaged: boolean;
  models: Array<{ modelCode: string; provider: string; modelId: string; displayName: string; pricingVersion: string }>;
  defaultModelCode: string | null;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxModelCalls: number;
  policyVersion: string;
  quota: {
    dailyTokens: number;
    monthlyTokens: number;
    dailyCostMicros: number;
    monthlyCostMicros: number;
    dailyTokensRemaining: number;
    monthlyTokensRemaining: number;
    dailyCostMicrosRemaining: number;
    monthlyCostMicrosRemaining: number;
  };
};

const EMPTY_MODEL_POLICY: RuoyiModelPolicy = {
  modelManaged: true,
  models: [],
  defaultModelCode: null,
  maxInputTokens: 0,
  maxOutputTokens: 0,
  maxModelCalls: 0,
  policyVersion: "none",
  quota: {
    dailyTokens: 0, monthlyTokens: 0, dailyCostMicros: 0, monthlyCostMicros: 0,
    dailyTokensRemaining: 0, monthlyTokensRemaining: 0, dailyCostMicrosRemaining: 0, monthlyCostMicrosRemaining: 0,
  },
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function modelPolicy(value: unknown): RuoyiModelPolicy {
  if (!value || typeof value !== "object") return EMPTY_MODEL_POLICY;
  const record = value as Record<string, unknown>;
  const seen = new Set<string>();
  const models = Array.isArray(record.models) ? record.models.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const model = item as Record<string, unknown>;
    const modelCode = typeof model.modelCode === "string" ? model.modelCode : "";
    const provider = typeof model.provider === "string" ? model.provider : "";
    const modelId = typeof model.modelId === "string" ? model.modelId : "";
    const key = `${provider}:${modelId}`;
    if (!modelCode || !provider || !modelId || seen.has(key)) return [];
    seen.add(key);
    return [{
      provider,
      modelCode,
      modelId,
      displayName: typeof model.displayName === "string" && model.displayName ? model.displayName : modelId,
      pricingVersion: typeof model.pricingVersion === "string" ? model.pricingVersion : "",
    }];
  }) : [];
  const quotaValue = record.quota && typeof record.quota === "object" ? record.quota as Record<string, unknown> : {};
  return {
    modelManaged: record.modelManaged === true,
    models,
    defaultModelCode: typeof record.defaultModelCode === "string" ? record.defaultModelCode : null,
    maxInputTokens: nonNegativeInteger(record.maxInputTokens),
    maxOutputTokens: nonNegativeInteger(record.maxOutputTokens),
    maxModelCalls: nonNegativeInteger(record.maxModelCalls),
    policyVersion: typeof record.policyVersion === "string" && record.policyVersion ? record.policyVersion : "none",
    quota: {
      dailyTokens: nonNegativeInteger(quotaValue.dailyTokens),
      monthlyTokens: nonNegativeInteger(quotaValue.monthlyTokens),
      dailyCostMicros: nonNegativeInteger(quotaValue.dailyCostMicros),
      monthlyCostMicros: nonNegativeInteger(quotaValue.monthlyCostMicros),
      dailyTokensRemaining: nonNegativeInteger(quotaValue.dailyTokensRemaining),
      monthlyTokensRemaining: nonNegativeInteger(quotaValue.monthlyTokensRemaining),
      dailyCostMicrosRemaining: nonNegativeInteger(quotaValue.dailyCostMicrosRemaining),
      monthlyCostMicrosRemaining: nonNegativeInteger(quotaValue.monthlyCostMicrosRemaining),
    },
  };
}

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
    modelPolicy: modelPolicy(record.modelPolicy),
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
