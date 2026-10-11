import { NextResponse } from "next/server";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity } from "./ruoyi-identity";
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
