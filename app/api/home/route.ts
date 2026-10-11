import { NextResponse } from "next/server";
import { homedir } from "os";
import { isRuoyiIntegrationEnabled } from "@/lib/ruoyi-identity";

export async function GET() {
  if (isRuoyiIntegrationEnabled()) {
    return NextResponse.json({ error: "RuoYi 模式不公开服务器主目录" }, { status: 403 });
  }
  return NextResponse.json({ home: homedir() });
}
