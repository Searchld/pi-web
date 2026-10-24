import { NextResponse } from "next/server";
import {
  isRuoyiIntegrationEnabled,
  resolveRuoyiIdentity,
  ruoyiWorkspaceFor,
  type RuoyiIdentity,
} from "./ruoyi-identity";
import {
  loadRuoyiAgentPolicy,
  RuoyiToolAuthorizationError,
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
  const identity = await requireRuoyiIdentity(request);
  if (identity instanceof NextResponse || identity === null) return identity;
  try {
    const policy = await loadRuoyiAgentPolicy(identity);
    return { identity, policy, workspace: ruoyiWorkspaceFor(identity.userId) };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取 Agent 权限失败" },
      { status: error instanceof RuoyiToolAuthorizationError ? 503 : 500 },
    );
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
