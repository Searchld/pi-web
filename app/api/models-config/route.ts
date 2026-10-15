import { NextResponse } from "next/server";
import { ModelsConfigReadError, readModelsConfig, writeModelsConfig } from "@/lib/models-config-store";
import { requireRuoyiSettingsAccess } from "@/lib/ruoyi-settings-access";
import { ContextWindowError, normalizeContextWindowOverrides } from "@/lib/model-context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireRuoyiSettingsAccess(req, "models");
  if (denied) return denied;
  try {
    return NextResponse.json(readModelsConfig());
  } catch (error) {
    if (error instanceof ModelsConfigReadError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireRuoyiSettingsAccess(req, "models");
  if (denied) return denied;
  try {
    const body = await req.json() as Record<string, unknown>;
    writeModelsConfig(normalizeContextWindowOverrides(body));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ContextWindowError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ModelsConfigReadError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
