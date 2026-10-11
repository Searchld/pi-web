import { NextResponse } from "next/server";
import { readSessionHeader, resolveSessionPath } from "./session-reader";
import { getRpcSession } from "./rpc-manager";
import { samePath } from "./paths";
import { isRuoyiIntegrationEnabled } from "./ruoyi-identity";
import { requireRuoyiChatAccess } from "./ruoyi-access";
import type { RuoyiIdentity } from "./ruoyi-identity";

export type RuoyiSessionAccess = { identity: RuoyiIdentity; workspace: string };
export type OptionalRuoyiSessionAccess = RuoyiSessionAccess | NextResponse | null;

/** 会话路由必须用此检查归属；只过滤列表不足以形成用户隔离。 */
export async function requireRuoyiSessionAccess(request: Request, sessionId: string): Promise<RuoyiSessionAccess | NextResponse> {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse || access === null) {
    return access ?? NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 500 });
  }
  const { identity, workspace } = access;
  const live = getRpcSession(sessionId);
  const path = live?.isAlive() ? undefined : await resolveSessionPath(sessionId);
  if (!live?.isAlive() && !path) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const cwd = live?.isAlive() ? live.cwd : readSessionHeader(path!)?.cwd;
  // 返回 404 而不是 403，避免通过 session id 枚举其他用户会话。
  if (!cwd || !samePath(cwd, workspace)) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return { identity, workspace };
}

export async function requireIntegrationSessionAccess(request: Request, sessionId: string): Promise<OptionalRuoyiSessionAccess> {
  if (!isRuoyiIntegrationEnabled()) return null;
  return requireRuoyiSessionAccess(request, sessionId);
}

export function isRuoyiAccessDenied(value: RuoyiSessionAccess | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
