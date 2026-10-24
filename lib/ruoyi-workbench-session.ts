import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isValidSessionId } from "./session-file-references-core";

export async function readRuoyiWorkbenchSession(path: string): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as { sessionId?: unknown };
    return typeof value.sessionId === "string" && isValidSessionId(value.sessionId)
      ? value.sessionId
      : null;
  } catch {
    return null;
  }
}

export async function writeRuoyiWorkbenchSession(path: string, sessionId: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify({ sessionId }), { mode: 0o600 });
  await rename(temporaryPath, path);
}

export async function clearRuoyiWorkbenchSession(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    // 找不到旧映射时无需清理。
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
