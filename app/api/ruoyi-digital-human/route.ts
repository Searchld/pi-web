import { NextResponse } from "next/server";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

const VOICE_ENABLED_KEY = "ui.console-pet.voice-enabled";
const DIGITAL_HUMAN_HIDDEN_KEY = "ui.qimiao-web.digital-human-hidden";

function ruoyiApiBaseUrl(): string | null {
  return process.env.RUOYI_API_BASE_URL?.trim().replace(/\/+$/, "") || null;
}

/** 仅返回当前登录用户可见的数字人偏好，令牌始终留在 Pi Web 服务端。 */
export async function GET(request: Request) {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse) return access;
  const baseUrl = ruoyiApiBaseUrl();
  if (!access || !baseUrl) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });

  try {
    const response = await fetch(`${baseUrl}/system/user-ui`, {
      headers: { Authorization: access.identity.authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown; data?: unknown } | null;
    if (!response.ok || Number(payload?.code) !== 200 || !payload?.data || typeof payload.data !== "object") {
      return NextResponse.json({ settings: {} }, { headers: { "Cache-Control": "no-store" } });
    }
    const settings = Object.fromEntries(Object.entries(payload.data as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ settings: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}

/** 仅保存 Pi 数字人自己的偏好，仍由 RuoYi 按当前账号和白名单校验。 */
export async function PUT(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse) return access;
  const baseUrl = ruoyiApiBaseUrl();
  if (!access || !baseUrl) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const preferences = body as { voiceEnabled?: unknown; digitalHumanHidden?: unknown } | null;
  const voiceEnabled = preferences?.voiceEnabled;
  const digitalHumanHidden = preferences?.digitalHumanHidden;
  if (voiceEnabled !== undefined && typeof voiceEnabled !== "boolean") {
    return NextResponse.json({ error: "voiceEnabled must be a boolean" }, { status: 400 });
  }
  if (digitalHumanHidden !== undefined && typeof digitalHumanHidden !== "boolean") {
    return NextResponse.json({ error: "digitalHumanHidden must be a boolean" }, { status: 400 });
  }
  if (voiceEnabled === undefined && digitalHumanHidden === undefined) {
    return NextResponse.json({ error: "No digital human preference supplied" }, { status: 400 });
  }
  const values: Record<string, string> = {};
  if (typeof voiceEnabled === "boolean") values[VOICE_ENABLED_KEY] = String(voiceEnabled);
  if (typeof digitalHumanHidden === "boolean") values[DIGITAL_HUMAN_HIDDEN_KEY] = String(digitalHumanHidden);

  try {
    const response = await fetch(`${baseUrl}/system/user-ui`, {
      method: "PUT",
      headers: {
        Authorization: access.identity.authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown } | null;
    if (!response.ok || Number(payload?.code) !== 200) {
      return NextResponse.json({ error: "语音偏好保存失败" }, { status: 502 });
    }
    return NextResponse.json({ voiceEnabled, digitalHumanHidden }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "语音偏好保存失败" }, { status: 502 });
  }
}
