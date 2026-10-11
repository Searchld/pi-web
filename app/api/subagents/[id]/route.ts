import { NextResponse } from "next/server";
import { abortSubagent, getSubagentRun, steerSubagent } from "@/lib/rpc-manager";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError } from "@/lib/ruoyi-tool-policy";

async function authorizeSubagent(request: Request, id: string, permission: "get_subagent_result" | "steer_subagent") {
  const run = await getSubagentRun(id);
  if (!run) return { response: NextResponse.json({ error: "Subagent not found" }, { status: 404 }) };
  const access = await requireIntegrationSessionAccess(request, run.parentSessionId);
  if (access && isRuoyiAccessDenied(access)) return { response: access };
  if (access) {
    try {
      const policy = await loadRuoyiAgentPolicy(access.identity);
      if (!policy.subagentToolNames.includes(permission)) {
        return { response: NextResponse.json({ error: "当前账户未获得子 Agent 操作权限" }, { status: 403 }) };
      }
    } catch (error) {
      return { response: NextResponse.json(
        { error: error instanceof Error ? error.message : "读取 Agent 权限失败" },
        { status: error instanceof RuoyiToolAuthorizationError ? 503 : 500 },
      ) };
    }
  }
  return { run };
}

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const authorized = await authorizeSubagent(req, id, "get_subagent_result");
    if ("response" in authorized) return authorized.response;
    return NextResponse.json({ run: authorized.run });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json() as { action?: unknown; message?: unknown };
    const permission = body.action === "steer" || body.action === "abort"
      ? "steer_subagent" as const
      : null;
    if (!permission) return NextResponse.json({ error: "action must be steer or abort" }, { status: 400 });
    const authorized = await authorizeSubagent(req, id, permission);
    if ("response" in authorized) return authorized.response;
    if (body.action === "steer") {
      if (typeof body.message !== "string" || !body.message.trim()) {
        return NextResponse.json({ error: "message required" }, { status: 400 });
      }
      await steerSubagent(id, body.message);
    } else if (body.action === "abort") {
      await abortSubagent(id);
    }
    return NextResponse.json({ ok: true, run: await getSubagentRun(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: message.includes("not running") ? 409 : 500 });
  }
}
