import { NextResponse } from "next/server";
import { RUOYI_BUSINESS_SYSTEM_PROMPT } from "@/lib/ruoyi-business-tools";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity } from "@/lib/ruoyi-identity";
import { isApiRequestAllowed, hasJsonContentType } from "@/lib/request-security";
import { requireRuoyiSettingsAccess } from "@/lib/ruoyi-settings-access";
import {
  readRuoyiSystemPromptPreference,
  validateRuoyiSystemPromptPreference,
  writeRuoyiSystemPromptPreference,
} from "@/lib/ruoyi-system-prompt";

export const dynamic = "force-dynamic";

async function identityForGeneralSettings(req: Request) {
  if (!isRuoyiIntegrationEnabled()) return null;
  const denied = await requireRuoyiSettingsAccess(req, "general");
  if (denied) return denied;
  const identity = await resolveRuoyiIdentity(req);
  return identity.ok
    ? identity.identity
    : NextResponse.json({ error: identity.error }, { status: identity.status });
}

export async function GET(request: Request) {
  const identity = await identityForGeneralSettings(request);
  if (identity === null) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });
  if (identity instanceof NextResponse) return identity;
  const preference = await readRuoyiSystemPromptPreference(identity.userId, RUOYI_BUSINESS_SYSTEM_PROMPT);
  return NextResponse.json(preference, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const identity = await identityForGeneralSettings(request);
  if (identity === null) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });
  if (identity instanceof NextResponse) return identity;
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(request)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  try {
    const preference = validateRuoyiSystemPromptPreference(await request.json());
    await writeRuoyiSystemPromptPreference(identity.userId, preference);
    return NextResponse.json(preference);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存提示词失败" }, { status: 400 });
  }
}
