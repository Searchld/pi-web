export function normalizeFilePathSlashes(filePath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\")) {
    return filePath.replace(/\\/g, "/");
  }
  return filePath;
}

export function encodeFilePathForApi(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath);
  const segments = normalized.split("/").filter(Boolean);
  // A literal "//" prefix is normalized away by URL routing before it reaches
  // the catch-all handler, so a UNC root must live inside the first segment:
  // "//host" encodes as "%2F%2Fhost" and decodes back as a single segment.
  if (normalized.startsWith("//") && segments.length > 0) {
    segments[0] = `//${segments[0]}`;
  }
  return segments.map(encodeURIComponent).join("/");
}

export function getFileName(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/\/+$/, "");
  return normalized.split("/").pop() ?? normalized;
}

export function getFileDirectory(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return "";
  if (lastSlash === 0) return "/";
  if (lastSlash === 2 && /^[a-zA-Z]:\//.test(normalized)) return normalized.slice(0, 3);
  return normalized.slice(0, lastSlash);
}

export function getRelativeFilePath(filePath: string, cwd?: string): string {
  if (!cwd) return filePath;

  const normalizedFile = normalizeFilePathSlashes(filePath);
  const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/$/, "");
  if (normalizedFile.startsWith(normalizedCwd + "/")) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }
  return filePath;
}

/** 只把工作区内的文件转换为若依接受的相对路径。 */
export function getWorkspaceDownloadPath(filePath: string, cwd?: string): string | null {
  if (!cwd) return null;
  const root = normalizeFilePathSlashes(cwd).replace(/\/+$/, "");
  const candidate = normalizeFilePathSlashes(filePath);
  const windows = /^[a-zA-Z]:\//.test(root) || root.startsWith("//");
  const matches = windows
    ? candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    : candidate.startsWith(`${root}/`);
  if (!matches) return null;
  const relative = candidate.slice(root.length + 1);
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === ".." || /[\\:\0]/.test(part))) return null;
  return relative;
}

export function joinFilePath(parent: string, child: string): string {
  return `${normalizeFilePathSlashes(parent).replace(/\/$/, "")}/${child}`;
}
