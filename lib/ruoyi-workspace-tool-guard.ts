import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { isExistingFilePathAllowed, isFilePathAllowed } from "./file-access";
import { hasParentDirectorySegment } from "./path-security";

const PATH_TOOLS = new Set(["read", "grep", "find", "ls", "edit", "write"]);

function toolInput(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return {};
  const record = event as { input?: unknown; args?: unknown };
  const input = record.input ?? record.args;
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

/**
 * 写入目标可能尚不存在；从目标向上找到第一个已存在节点，再通过真实路径验证，
 * 以避免在工作区中的符号链接将新文件写到工作区外。
 */
function isWritablePathWithinWorkspace(target: string, roots: Set<string>): boolean {
  if (!isFilePathAllowed(target, roots)) return false;
  let existing = target;
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return false;
    existing = parent;
  }
  try {
    lstatSync(existing);
  } catch {
    return false;
  }
  return isExistingFilePathAllowed(existing, roots);
}

function isToolPathAllowed(toolName: string, input: Record<string, unknown>, workspace: string): boolean {
  const rawPath = input.path;
  // grep/find/ls 的 path 可省略，省略时其实现使用会话 cwd。
  if (rawPath !== undefined && typeof rawPath !== "string") return false;
  if (typeof rawPath === "string" && hasParentDirectorySegment(rawPath)) return false;
  const resolved = path.resolve(workspace, rawPath || ".");
  const roots = new Set([workspace]);
  return toolName === "write"
    ? isWritablePathWithinWorkspace(resolved, roots)
    : isExistingFilePathAllowed(resolved, roots);
}

/**
 * Pi 原生文件工具接受绝对路径。RuoYi 模式在执行前拦截路径，保证普通文件工具
 * 不会通过绝对路径、.. 或符号链接离开当前用户工作区。
 *
 * bash 无法可靠解析任意 shell 语法；其宿主机风险由部署权限模型承担，只保证
 * Pi 以工作区作为 cwd 启动 bash。
 */
export function createRuoyiWorkspaceToolGuard(workspace: string): InlineExtension {
  return {
    name: "pi-web-ruoyi-workspace-tool-guard",
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        const toolName = event.toolName;
        if (!PATH_TOOLS.has(toolName)) return undefined;
        if (isToolPathAllowed(toolName, toolInput(event), workspace)) return undefined;
        return { block: true, reason: "RuoYi 模式下只能访问当前用户工作区内的文件。" };
      });
    },
  };
}
