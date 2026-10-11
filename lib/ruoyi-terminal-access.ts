import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity, type RuoyiIdentity } from "./ruoyi-identity";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError } from "./ruoyi-tool-policy";
import { requireRuoyiToolAccess, type RuoyiPolicyAccess } from "./ruoyi-access";

const POLICY_CACHE_TTL_MS = 3_000;

declare global {
  var __piWebRuoyiTerminalPolicyCache: Map<string, { allowed: boolean; expiresAt: number }> | undefined;
}

function policyCache(): Map<string, { allowed: boolean; expiresAt: number }> {
  return (globalThis.__piWebRuoyiTerminalPolicyCache ??= new Map());
}

function cacheKey(identity: RuoyiIdentity): string {
  return createHash("sha256").update(identity.authorization).digest("hex");
}

/**
 * RuoYi 模式下，Web 终端与 bash 工具是同一种任意命令执行能力。
 * 输入接口会被逐键调用，短暂缓存权限结果以避免每次按键都请求权限服务。
 */
async function canUseTerminal(identity: RuoyiIdentity): Promise<boolean> {
  const key = cacheKey(identity);
  const cached = policyCache().get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  const allowed = (await loadRuoyiAgentPolicy(identity)).toolNames.includes("bash");
  policyCache().set(key, { allowed, expiresAt: Date.now() + POLICY_CACHE_TTL_MS });
  return allowed;
}

/** 在非 RuoYi 模式不介入；RuoYi 模式缺少 bash 权限时一律拒绝终端 API。 */
export async function requireRuoyiTerminalAccess(request: Request): Promise<NextResponse | null> {
  if (!isRuoyiIntegrationEnabled()) return null;
  const identity = await resolveRuoyiIdentity(request);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  try {
    if (await canUseTerminal(identity.identity)) return null;
    return NextResponse.json({ error: "当前账户未获得终端命令权限" }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 Agent 权限失败" }, {
      status: error instanceof RuoyiToolAuthorizationError ? 503 : 500,
    });
  }
}

/** 终端路由还需要当前用户和固定工作区，用于绑定并校验终端 ID。 */
export async function requireRuoyiTerminalOwnerAccess(
  request: Request,
): Promise<RuoyiPolicyAccess | NextResponse | null> {
  return requireRuoyiToolAccess(request, "bash");
}
