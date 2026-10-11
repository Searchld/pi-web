import { NextResponse } from "next/server";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { generateSessionTitle } from "@/lib/session-title";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { invalidateSessionListCache, resolveSessionPath } from "@/lib/session-reader";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { loadRuoyiAgentPolicy } from "@/lib/ruoyi-tool-policy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;

  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const existing = getRpcSession(id);
    const ruoyiPolicy = access ? await loadRuoyiAgentPolicy(access.identity) : undefined;
    const toolNames = ruoyiPolicy?.toolNames;
    if (access && existing?.isAlive()) {
      existing.setRuoyiAuthorization(access.identity.authorization);
      existing.setRuoyiPolicy(ruoyiPolicy!);
    }
    const { session } = existing?.isAlive()
      ? { session: existing }
      : await startRpcSession(id, filePath, undefined, {
        ...(toolNames !== undefined ? { toolNames } : {}),
        ...(access ? { ruoyiAuthorization: access.identity.authorization } : {}),
        ...(ruoyiPolicy ? { ruoyiPolicy } : {}),
        ...(access ? { forceToolNames: true } : {}),
      });

    // globalThis keeps wrappers alive across dev hot reloads; older instances
    // may predate waitUntilReady(), but those have already completed startup.
    await session.waitUntilReady?.();
    const result = await generateSessionTitle(session.inner as unknown as AgentSession);

    if (!session.isAlive()) {
      return NextResponse.json(
        { error: "The session was closed while its title was being generated. Please try again." },
        { status: 409 },
      );
    }

    session.inner.setSessionName(result.title);
    invalidateSessionListCache();
    return NextResponse.json({ title: result.title, usage: result.usage ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
