import { NextResponse } from "next/server";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";

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
