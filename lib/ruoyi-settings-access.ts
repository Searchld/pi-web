import { NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { samePath } from "./paths";
import { trustProject } from "./project-trust";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity, ruoyiWorkspaceFor } from "./ruoyi-identity";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError, type RuoyiAgentPolicy } from "./ruoyi-tool-policy";
import type { SettingsSection } from "./settings-navigation";

/** RuoYi 模式下设置页和对应 API 都必须按角色权限收口。 */
export async function requireRuoyiSettingsAccess(request: Request, section: SettingsSection): Promise<NextResponse | null> {
  if (!isRuoyiIntegrationEnabled()) return null;
  const identity = await resolveRuoyiIdentity(request);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  try {
    const policy: RuoyiAgentPolicy = await loadRuoyiAgentPolicy(identity.identity);
    if (policy.settingsSections.includes(section)) return null;
    return NextResponse.json({ error: "当前账户未获得该设置权限" }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 Agent 权限失败" }, {
      status: error instanceof RuoyiToolAuthorizationError ? 503 : 500,
    });
  }
}

/**
 * RuoYi 只信任已由令牌验证、且路径严格等于该用户固定工作区的项目。
 * 调用方仍须先通过对应设置页的权限校验，不能把此函数当作授权入口。
 */
export async function trustVerifiedRuoyiWorkspace(request: Request, cwd: string): Promise<NextResponse | null> {
  if (!isRuoyiIntegrationEnabled()) return null;
  const identity = await resolveRuoyiIdentity(request);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  if (!samePath(cwd, ruoyiWorkspaceFor(identity.identity.userId))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  try {
    // 工作区为空时也留下精确决定，后续首次安装 .pi/skills 不会变成未信任。
    trustProject(cwd, getAgentDir(), { allowFresh: true });
    return null;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
