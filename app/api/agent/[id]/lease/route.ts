import { NextResponse } from "next/server";
import { renewSessionLivenessLeases } from "@/lib/session-liveness";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";

// POST /api/agent/[id]/lease - Renew selected-session SSE leases.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;
  return NextResponse.json({
    success: true,
    renewed: renewSessionLivenessLeases(id),
  }, { headers: { "Cache-Control": "no-store" } });
}
