import { NextResponse } from "next/server";
import { resolveRuoyiIdentity, type RuoyiIdentity } from "@/lib/ruoyi-identity";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError } from "@/lib/ruoyi-tool-policy";
import { loadRuoyiSystemPrompt } from "@/lib/ruoyi-system-prompt";
import { RUOYI_BUSINESS_SYSTEM_PROMPT } from "@/lib/ruoyi-business-tools";
import { runRuoyiChannelPrompt } from "@/lib/ruoyi-channel";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { hasJsonContentType } from "@/lib/request-security";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_SESSION_ID_LENGTH = 200;

export async function POST(request: Request) {
  try {
    if (!hasJsonContentType(request)) {
      return NextResponse.json({ error: "Content-Type 必须是 application/json" }, { status: 415 });
    }
    const body = await request.json().catch(() => null) as {
      message?: unknown;
      sessionId?: unknown;
    } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : undefined;
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "message 必填，且不得超过 4000 个字符" }, { status: 400 });
    }
    if (sessionId && sessionId.length > MAX_SESSION_ID_LENGTH) {
      return NextResponse.json({ error: "sessionId 无效" }, { status: 400 });
    }

    const access = sessionId ? await requireIntegrationSessionAccess(request, sessionId) : null;
    if (access && isRuoyiAccessDenied(access)) return access;
    let identity: RuoyiIdentity;
    if (access) {
      identity = access.identity;
    } else {
      const resolved = await resolveRuoyiIdentity(request);
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      identity = resolved.identity;
    }
    const policy = await loadRuoyiAgentPolicy(identity);
    if (!policy.chatEnabled) {
      return NextResponse.json({ error: "当前账户未获得 Agent 使用权限" }, { status: 403 });
    }
    const systemPrompt = await loadRuoyiSystemPrompt(
      identity.userId,
      RUOYI_BUSINESS_SYSTEM_PROMPT,
    );
    const result = await runRuoyiChannelPrompt({
      identity,
      policy,
      systemPrompt,
      message,
      ...(sessionId ? { sessionId } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent 回答失败";
    const status = error instanceof RuoyiToolAuthorizationError
      ? 403
      : message === "Agent 会话不存在" ? 404 : 500;
    return NextResponse.json({ error: message }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
