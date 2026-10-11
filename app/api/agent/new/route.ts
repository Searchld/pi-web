import { NextResponse } from "next/server";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { startRpcSession } from "@/lib/rpc-manager";
import { isRuoyiIntegrationEnabled, resolveRuoyiIdentity, ruoyiWorkspaceFor, type RuoyiIdentity } from "@/lib/ruoyi-identity";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError, type RuoyiAgentPolicy } from "@/lib/ruoyi-tool-policy";

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel)) {
    return value as ThinkingLevel;
  }
  throw new Error(`Invalid thinking level: ${String(value)}`);
}
// POST /api/agent/new  body: { cwd: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns pi's real session id plus the model/thinking state selected at startup.
export async function POST(req: Request) {
  let commandType: string | undefined;
  let promptAccepted = false;
  try {
    const body = await req.json() as { cwd?: string; [key: string]: unknown };
    const { cwd: requestedCwd, ...command } = body;
    commandType = typeof command.type === "string" ? command.type : undefined;

    let cwd = requestedCwd;
    let ruoyiIdentity: RuoyiIdentity | undefined;
    let ruoyiPolicy: RuoyiAgentPolicy | undefined;
    if (isRuoyiIntegrationEnabled()) {
      const identity = await resolveRuoyiIdentity(req);
      if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
      ruoyiIdentity = identity.identity;
      ruoyiPolicy = await loadRuoyiAgentPolicy(ruoyiIdentity);
      if (!ruoyiPolicy.chatEnabled) {
        return NextResponse.json({ error: "当前账户未获得 Agent 使用权限" }, { status: 403 });
      }
      cwd = ruoyiWorkspaceFor(identity.identity.userId);
      await mkdir(cwd, { recursive: true });
    }

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({
        error: "cwd is required",
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({
        error: `Directory does not exist: ${cwd}`,
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 400 });
    }

    // Use a one-time key so startRpcSession's lock doesn't conflict with real session ids
    const { provider, modelId, toolNames: requestedToolNames, thinkingLevel, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: unknown; thinkingLevel?: unknown; [key: string]: unknown };
    if ((provider && !modelId) || (!provider && modelId)) {
      throw new Error("provider and modelId must be provided together");
    }
    let toolNames: string[] | undefined;
    if (!isRuoyiIntegrationEnabled()) {
      if (requestedToolNames !== undefined && (!Array.isArray(requestedToolNames) || requestedToolNames.some((name) => typeof name !== "string"))) {
        throw new Error("toolNames must be an array of strings");
      }
      toolNames = requestedToolNames as string[] | undefined;
    }
    const explicitThinkingLevel = parseThinkingLevel(thinkingLevel);

    if (isRuoyiIntegrationEnabled()) {
      if (!ruoyiIdentity) throw new Error("RuoYi 身份校验未完成");
      if (!ruoyiPolicy) throw new Error("RuoYi 权限校验未完成");
      // 浏览器可能带着上一次本地预设；RuoYi 模式必须忽略它，始终以当前角色策略为准。
      toolNames = ruoyiPolicy.toolNames;
    }

    // Must be unique per request: startRpcSession coalesces concurrent callers
    // that share a key onto one session. Date.now() (ms resolution) collides for
    // requests in the same millisecond, merging two new sessions into one.
    const tempKey = `__new__${randomUUID()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, {
      ...(toolNames !== undefined ? { toolNames } : {}),
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
      ...(explicitThinkingLevel ? { thinkingLevel: explicitThinkingLevel } : {}),
      ...(ruoyiIdentity ? { ruoyiAuthorization: ruoyiIdentity.authorization } : {}),
      ...(ruoyiPolicy ? { ruoyiPolicy } : {}),
      ...(ruoyiIdentity ? { forceToolNames: true } : {}),
    });

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    allowFileRoot(cwd);
    invalidateSessionListCache();

    const state = await session.send({ type: "get_state" }) as {
      model?: { id: string; provider: string };
      thinkingLevel?: string;
    };

    if (promptCommand.type === "ensure_session") {
      return NextResponse.json({
        success: true,
        sessionId: realSessionId,
        data: null,
        model: state.model
          ? { provider: state.model.provider, modelId: state.model.id }
          : null,
        thinkingLevel: state.thinkingLevel,
      });
    }

    const result = await session.send(promptCommand);
    promptAccepted = promptCommand.type === "prompt";

    return NextResponse.json({
      success: true,
      sessionId: realSessionId,
      data: result,
      model: state.model
        ? { provider: state.model.provider, modelId: state.model.id }
        : null,
      thinkingLevel: state.thinkingLevel,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: error instanceof RuoyiToolAuthorizationError ? 403 : 500 });
  }
}
