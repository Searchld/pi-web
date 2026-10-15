import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession, setRpcSessionTools } from "@/lib/rpc-manager";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { loadRuoyiAgentPolicy, sameRuoyiCodingToolNames, sameRuoyiSkillNames, RuoyiToolAuthorizationError } from "@/lib/ruoyi-tool-policy";
import { RUOYI_BUSINESS_SYSTEM_PROMPT } from "@/lib/ruoyi-business-tools";
import { loadRuoyiSystemPrompt } from "@/lib/ruoyi-system-prompt";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;
    const requestedToolNames = body.toolNames;
    if (
      requestedToolNames !== undefined
      && (!Array.isArray(requestedToolNames) || requestedToolNames.some((name) => typeof name !== "string"))
    ) {
      throw new Error("toolNames must be an array of strings");
    }
    const toolNames = requestedToolNames as string[] | undefined;
    const ruoyiPolicy = access ? await loadRuoyiAgentPolicy(access.identity) : undefined;
    const ruoyiSystemPrompt = access
      ? await loadRuoyiSystemPrompt(access.identity.userId, RUOYI_BUSINESS_SYSTEM_PROMPT)
      : undefined;
    if (access && body.type === "bash" && !ruoyiPolicy!.toolNames.includes("bash")) {
      throw new RuoyiToolAuthorizationError("当前账户未获得终端命令权限");
    }

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (body.type === "set_tools") {
      if (access) throw new RuoyiToolAuthorizationError("Agent 工具由系统权限统一管理");
      const filePath = existing?.sessionFile || await resolveSessionPath(id) || undefined;
      if (!existing?.isAlive() && !filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const changed = await setRpcSessionTools(id, filePath, toolNames);
      return NextResponse.json({
        success: true,
        data: { sessionId: changed.sessionId, recreated: changed.recreated },
      });
    }
    if (existing?.isAlive()) {
      let session = existing;
      if (access) {
        const codingToolsChanged = !sameRuoyiCodingToolNames(existing.getActiveCodingToolNames(), ruoyiPolicy!.toolNames);
        const skillsChanged = !sameRuoyiSkillNames(existing.getRuoyiLoadedSkillNames(), ruoyiPolicy!.skillNames);
        existing.setRuoyiAuthorization(access.identity.authorization);
        existing.setRuoyiPolicy(ruoyiPolicy!);
        existing.setRuoyiSystemPrompt(ruoyiSystemPrompt!);
        if (codingToolsChanged || skillsChanged) {
          const tightened = await setRpcSessionTools(id, existing.sessionFile || undefined, ruoyiPolicy!.toolNames, {
            ruoyiAuthorization: access.identity.authorization,
            ruoyiPolicy,
            forceToolNames: true,
            ...(skillsChanged ? { recreateForResources: true } : {}),
          });
          session = tightened.session;
        }
      }
      const result = await session.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const initialToolNames = access ? ruoyiPolicy!.toolNames : toolNames;
    const { session } = await startRpcSession(id, filePath, undefined, {
      ...(initialToolNames !== undefined ? { toolNames: initialToolNames } : {}),
      ...(access ? { ruoyiAuthorization: access.identity.authorization } : {}),
      ...(ruoyiPolicy ? { ruoyiPolicy } : {}),
      ...(ruoyiSystemPrompt !== undefined ? { ruoyiSystemPrompt } : {}),
      ...(access ? { forceToolNames: true } : {}),
    });
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: error instanceof RuoyiToolAuthorizationError ? 403 : 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }
    if (access) session.setRuoyiAuthorization(access.identity.authorization);

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
