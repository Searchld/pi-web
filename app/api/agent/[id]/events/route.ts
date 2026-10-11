import { createAgentEventStream } from "@/lib/agent-event-stream";
import { resolveSessionPath } from "@/lib/session-reader";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError, type RuoyiAgentPolicy } from "@/lib/ruoyi-tool-policy";

export const dynamic = "force-dynamic";

// GET /api/agent/[id]/events - SSE stream of agent events
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (req.signal.aborted) return new Response(null, { status: 204 });
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;
  let ruoyiPolicy: RuoyiAgentPolicy | undefined;
  try {
    ruoyiPolicy = access ? await loadRuoyiAgentPolicy(access.identity) : undefined;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "读取 RuoYi Agent 权限失败", {
      status: error instanceof RuoyiToolAuthorizationError ? 503 : 500,
    });
  }

  // Fast path: already-running session
  const session = getRpcSession(id);
  let sessionPromise;
  if (session?.isAlive()) {
    if (access) {
      session.setRuoyiAuthorization(access.identity.authorization);
      session.setRuoyiPolicy(ruoyiPolicy!);
    }
    sessionPromise = Promise.resolve(session);
  } else {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return new Response("Session not found", { status: 404 });
    }
    if (req.signal.aborted) return new Response(null, { status: 204 });
    const toolNames = access ? ruoyiPolicy!.toolNames : undefined;
    sessionPromise = startRpcSession(id, filePath, undefined, {
      ...(toolNames !== undefined ? { toolNames } : {}),
      ...(access ? { ruoyiAuthorization: access.identity.authorization } : {}),
      ...(ruoyiPolicy ? { ruoyiPolicy } : {}),
      ...(access ? { forceToolNames: true } : {}),
    }).then((result) => result.session);
  }

  const stream = createAgentEventStream(req, id, sessionPromise);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
