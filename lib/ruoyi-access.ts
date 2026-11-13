import { NextResponse } from "next/server";
import {
  isRuoyiIntegrationEnabled,
  readRuoyiAuthorization,
  resolveRuoyiIdentity,
  ruoyiWorkspaceFor,
  type RuoyiIdentity,
} from "./ruoyi-identity";
import {
  normalizeRuoyiAgentPolicy,
  type RuoyiAgentPolicy,
} from "./ruoyi-tool-policy";

export type RuoyiPolicyAccess = {
  identity: RuoyiIdentity;
  policy: RuoyiAgentPolicy;
  workspace: string;
};

/** RuoYi 模式的统一身份入口；本地模式不介入既有 API。 */
export async function requireRuoyiIdentity(request: Request): Promise<RuoyiIdentity | NextResponse | null> {
  if (!isRuoyiIntegrationEnabled()) return null;
  const result = await resolveRuoyiIdentity(request);
  return result.ok
    ? result.identity
    : NextResponse.json({ error: result.error }, { status: result.status });
}

/** 读取当前角色实时策略，权限服务异常时拒绝而不是回退到旧权限。 */
export async function requireRuoyiPolicy(request: Request): Promise<RuoyiPolicyAccess | NextResponse | null> {
  if (!isRuoyiIntegrationEnabled()) return null;
  const authorization = readRuoyiAuthorization(request);
  if (!authorization) return NextResponse.json({ error: "缺少 RuoYi 用户令牌" }, { status: 401 });
  try {
    const baseUrl = process.env.RUOYI_API_BASE_URL!.trim().replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/agent/v1/tool-policy/access`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => null) as {
      code?: unknown; data?: { userId?: unknown; policy?: unknown };
    } | null;
    if (response.status === 401 || response.status === 403 || Number(payload?.code) === 401 || Number(payload?.code) === 403) {
      return NextResponse.json({ error: "RuoYi 用户令牌无效或无权访问" }, { status: 401 });
    }
    const userId = payload?.data?.userId;
    if (!response.ok || Number(payload?.code) !== 200 || (typeof userId !== "number" && typeof userId !== "string")
        || !payload?.data?.policy || typeof payload.data.policy !== "object") {
      return NextResponse.json({ error: "读取 RuoYi Agent 权限失败" }, { status: 503 });
    }
    const identity: RuoyiIdentity = { userId: String(userId), authorization, permissions: [] };
    const policy = normalizeRuoyiAgentPolicy(payload.data.policy);
    return { identity, policy, workspace: ruoyiWorkspaceFor(identity.userId) };
  } catch {
    return NextResponse.json({ error: "无法连接 RuoYi Agent 权限服务" }, { status: 503 });
  }
}

/** 会话、工作区及工具能力均以 Agent 使用权限作为第一道服务端门槛。 */
export async function requireRuoyiChatAccess(request: Request): Promise<RuoyiPolicyAccess | NextResponse | null> {
  const access = await requireRuoyiPolicy(request);
  if (access instanceof NextResponse || access === null) return access;
  if (!access.policy.chatEnabled) {
    return NextResponse.json({ error: "当前账户未获得 Agent 使用权限，请联系管理员。" }, { status: 403 });
  }
  return access;
}

/** 数字人权限独立于聊天权限；使用嵌入式数字人时两者均需满足。 */
export async function requireRuoyiDigitalHumanAccess(request: Request): Promise<RuoyiPolicyAccess | NextResponse | null> {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse || access === null) return access;
  if (!access.policy.digitalHumanEnabled) {
    return NextResponse.json({ error: "当前账户未获得数字人使用权限。" }, { status: 403 });
  }
  return access;
}

/** 工具接口必须同时满足聊天入口与对应工具权限。 */
export async function requireRuoyiToolAccess(
  request: Request,
  toolName: string,
): Promise<RuoyiPolicyAccess | NextResponse | null> {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse || access === null) return access;
  if (!access.policy.toolNames.includes(toolName)) {
    return NextResponse.json({ error: "当前账户未获得该工具权限，请联系管理员。" }, { status: 403 });
  }
  return access;
}

export function isRuoyiAccessDenied(value: RuoyiPolicyAccess | NextResponse | null): value is NextResponse {
  return value instanceof NextResponse;
}
