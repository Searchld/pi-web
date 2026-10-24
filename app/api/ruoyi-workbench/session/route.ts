import { NextResponse } from "next/server";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";
import { isApiRequestAllowed, hasJsonContentType } from "@/lib/request-security";
import { isValidSessionId } from "@/lib/session-file-references-core";
import { requireRuoyiSessionAccess } from "@/lib/ruoyi-session-access";
import { clearRuoyiWorkbenchSession, readRuoyiWorkbenchSession, writeRuoyiWorkbenchSession } from "@/lib/ruoyi-workbench-session";
import { ruoyiWorkbenchSessionPath } from "@/lib/ruoyi-identity";

export const dynamic = "force-dynamic";

/** 恢复当前已验证 RuoYi 用户的工作台会话，并再次校验会话归属。 */
export async function GET(request: Request) {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse) return access;
  if (!access) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });

  const path = ruoyiWorkbenchSessionPath(access.identity.userId);
  const sessionId = await readRuoyiWorkbenchSession(path);
  if (!sessionId) return NextResponse.json({ sessionId: null }, { headers: { "Cache-Control": "no-store" } });

  const sessionAccess = await requireRuoyiSessionAccess(request, sessionId, access);
  if (sessionAccess instanceof NextResponse) {
    if (sessionAccess.status === 404) {
      await clearRuoyiWorkbenchSession(path);
      return NextResponse.json({ sessionId: null }, { headers: { "Cache-Control": "no-store" } });
    }
    return sessionAccess;
  }
  return NextResponse.json({ sessionId }, { headers: { "Cache-Control": "no-store" } });
}

/** 保存当前用户的工作台会话；用户身份只从服务端验证的令牌解析。 */
export async function POST(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse) return access;
  if (!access) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
  if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  const sessionAccess = await requireRuoyiSessionAccess(request, sessionId, access);
  if (sessionAccess instanceof NextResponse) return sessionAccess;
  await writeRuoyiWorkbenchSession(ruoyiWorkbenchSessionPath(access.identity.userId), sessionId);
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
