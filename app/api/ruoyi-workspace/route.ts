import { mkdir } from "node:fs/promises";
import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";

export async function POST(request: Request) {
  const access = await requireRuoyiChatAccess(request);
  if (access instanceof NextResponse) return access;
  if (!access) return NextResponse.json({ error: "RuoYi 集成未启用" }, { status: 500 });
  const cwd = access.workspace;
  await mkdir(cwd, { recursive: true });
  allowFileRoot(cwd);
  return NextResponse.json({ success: true, cwd });
}
