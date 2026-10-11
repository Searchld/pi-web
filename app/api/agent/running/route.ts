import { NextResponse } from "next/server";
import { getSessionListVersion } from "@/lib/session-reader";
import {
  getAwaitingInputRpcSessionIds,
  getCompletionNotificationSuppressedRpcSessionIds,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { getSessionUiStateRevision } from "@/lib/session-ui-state";
import { getRpcSessionInfos } from "@/lib/rpc-manager";
import { isRuoyiIntegrationEnabled, ruoyiSessionUiStatePath } from "@/lib/ruoyi-identity";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";

export const dynamic = "force-dynamic";

// GET /api/agent/running - Lightweight snapshot for visible-tab polling.
// sessionUiStateRevision (null when unreadable) tells the sidebar its pins and
// archive changed elsewhere; it costs one stat while the file is unchanged.
export async function GET(request: Request) {
  let visibleIds: Set<string> | undefined;
  let statePath: string | undefined;
  if (isRuoyiIntegrationEnabled()) {
    const access = await requireRuoyiChatAccess(request);
    if (access instanceof NextResponse) return access;
    if (!access) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 500 });
    const workspace = access.workspace;
    visibleIds = new Set(getRpcSessionInfos().filter((session) => session.cwd === workspace).map((session) => session.id));
    statePath = ruoyiSessionUiStatePath(access.identity.userId);
  }
  const filter = (ids: string[]) => visibleIds ? ids.filter((id) => visibleIds.has(id)) : ids;
  return NextResponse.json(
    {
      sessionListVersion: getSessionListVersion(),
      runningSessionIds: filter(getRunningRpcSessionIds()),
      awaitingInputSessionIds: filter(getAwaitingInputRpcSessionIds()),
      completionNotificationSuppressedSessionIds: filter(getCompletionNotificationSuppressedRpcSessionIds()),
      sessionUiStateRevision: getSessionUiStateRevision(statePath),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
