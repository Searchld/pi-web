import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/json-response";
import {
  attachSessionProjectInfo,
  getSessionListVersion,
  listAllSessions,
  listSessionSummaries,
  mergeSessionLists,
} from "@/lib/session-reader";
import {
  getAwaitingInputRpcSessionIds,
  getCompletionNotificationSuppressedRpcSessionIds,
  getRpcSessionInfos,
  getRunningRpcSessionIds,
  withSubagentDisplayStatus,
} from "@/lib/rpc-manager";
import { startServerPerf } from "@/lib/perf";
import { isRuoyiIntegrationEnabled } from "@/lib/ruoyi-identity";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const perf = startServerPerf("GET /api/sessions");
  try {
    let workspace: string | undefined;
    if (isRuoyiIntegrationEnabled()) {
      const access = await requireRuoyiChatAccess(req);
      if (access instanceof NextResponse) return access;
      if (!access) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 500 });
      workspace = access.workspace;
    }
    const searchParams = new URL(req.url).searchParams;
    const force = searchParams.get("force") === "1";
    // `summary=1` serves header/stat metadata so the sidebar can paint without
    // waiting for every session transcript to be parsed.
    const summary = searchParams.get("summary") === "1";
    perf?.span("start");
    const persistedSessionsPromise = summary
      ? listSessionSummaries()
      : listAllSessions({ force });
    // Capture before awaiting: mutations during the scan still require a later refresh.
    const sessionListVersion = getSessionListVersion();
    const [persistedSessions, runtimeSessions] = await Promise.all([
      persistedSessionsPromise,
      attachSessionProjectInfo(getRpcSessionInfos()),
    ]);
    perf?.span("scan+projects");
    const visibleSessions = mergeSessionLists(persistedSessions, runtimeSessions)
      .filter((session) => !workspace || session.cwd === workspace);
    const visibleSessionIds = workspace ? new Set(visibleSessions.map((session) => session.id)) : undefined;
    const visible = (ids: string[]) => visibleSessionIds ? ids.filter((id) => visibleSessionIds.has(id)) : ids;
    const sessions = withSubagentDisplayStatus(visibleSessions);
    return perf?.attach(jsonResponse(
      req,
      {
        sessions,
        sessionListVersion,
        runningSessionIds: visible(getRunningRpcSessionIds()),
        awaitingInputSessionIds: visible(getAwaitingInputRpcSessionIds()),
        completionNotificationSuppressedSessionIds: visible(getCompletionNotificationSuppressedRpcSessionIds()),
      },
      { headers: { "Cache-Control": "no-store" } },
    )) ?? jsonResponse(
      req,
      {
        sessions,
        sessionListVersion,
        runningSessionIds: visible(getRunningRpcSessionIds()),
        awaitingInputSessionIds: visible(getAwaitingInputRpcSessionIds()),
        completionNotificationSuppressedSessionIds: visible(getCompletionNotificationSuppressedRpcSessionIds()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
