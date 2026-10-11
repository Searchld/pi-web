import { NextResponse } from "next/server";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import {
  MAX_INLINE_BASH_OUTPUT_BYTES,
  openRegularFileNoFollow,
  readUtf8FileWithinLimit,
  resolveBashOutputPath,
} from "@/lib/bash-output";
import { isBashOutputPathReferencedBySession } from "@/lib/session-file-references";
import { isRuoyiAccessDenied, requireIntegrationSessionAccess } from "@/lib/ruoyi-session-access";
import { loadRuoyiAgentPolicy, RuoyiToolAuthorizationError } from "@/lib/ruoyi-tool-policy";

// GET /api/agent/[id]/bash-output?path=<absPath>
// Reads a bash output temp file referenced by this session. Inline display is
// size-limited; download responses stream the file without buffering it.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireIntegrationSessionAccess(req, id);
  if (access && isRuoyiAccessDenied(access)) return access;
  if (access) {
    try {
      if (!(await loadRuoyiAgentPolicy(access.identity)).toolNames.includes("bash")) {
        return NextResponse.json({ error: "当前账户未获得终端命令权限" }, { status: 403 });
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "读取 Agent 权限失败" },
        { status: error instanceof RuoyiToolAuthorizationError ? 503 : 500 },
      );
    }
  }
  let path: string | null = null;
  let download = false;
  try {
    const url = new URL(req.url);
    path = url.searchParams.get("path");
    download = url.searchParams.get("download") === "1";
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const resolved = resolveBashOutputPath(path, tmpdir());
  if (!resolved) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }

  if (!await isBashOutputPathReferencedBySession(resolved, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    if (download) {
      const { handle } = await openRegularFileNoFollow(resolved);
      const stream = Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"bash-output.log\"",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await readUtf8FileWithinLimit(resolved);
    if (result.tooLarge) {
      return NextResponse.json({
        error: `Full output is too large to display (limit ${MAX_INLINE_BASH_OUTPUT_BYTES} bytes)`,
        data: { size: result.size, maxBytes: MAX_INLINE_BASH_OUTPUT_BYTES },
      }, { status: 413 });
    }
    return NextResponse.json({ success: true, data: { output: result.content } });
  } catch {
    return NextResponse.json({ error: "full output unavailable" }, { status: 404 });
  }
}
