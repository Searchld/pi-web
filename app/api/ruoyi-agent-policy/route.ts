import { NextResponse } from "next/server";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity } from "@/lib/ruoyi-identity";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError } from "@/lib/ruoyi-tool-policy";

export async function GET(request: Request) {
  if (!isRuoyiIntegrationEnabled()) {
    return NextResponse.json({ enabled: false, managed: false });
  }
  const identity = await resolveRuoyiIdentity(request);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  try {
    const policy = await loadRuoyiAgentPolicy(identity.identity);
    return NextResponse.json({
      enabled: true,
      managed: true,
      ...policy,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 RuoYi Agent 权限失败" }, {
      status: error instanceof RuoyiToolAuthorizationError ? 503 : 500,
    });
  }
}
