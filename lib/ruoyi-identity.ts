import { createHash } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const RUOYI_TOKEN_COOKIE = "pi_web_ruoyi_token";
const IDENTITY_CACHE_TTL_MS = 5_000;

export type RuoyiIdentity = {
  userId: string;
  authorization: string;
  permissions: string[];
};

type IdentityResult =
  | { ok: true; identity: RuoyiIdentity }
  | { ok: false; status: 401 | 503; error: string };

declare global {
  var __piWebRuoyiIdentityCache: Map<string, { identity: RuoyiIdentity; expiresAt: number }> | undefined;
}

function baseUrl(): string | undefined {
  return process.env.RUOYI_API_BASE_URL?.trim().replace(/\/+$/, "") || undefined;
}

function normalizeAuthorization(value: string | undefined): string | undefined {
  const token = value?.trim();
  if (!token) return undefined;
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

export function isRuoyiIntegrationEnabled(): boolean {
  return Boolean(baseUrl());
}

export function readRuoyiAuthorization(request: Request): string | undefined {
  const header = request.headers.get("x-ruoyi-authorization") ?? undefined;
  if (header) return normalizeAuthorization(header);
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${RUOYI_TOKEN_COOKIE}=([^;]+)`))?.[1];
  if (!value) return undefined;
  try {
    return normalizeAuthorization(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

export function shouldUseSecureRuoyiCookie(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProto ? forwardedProto === "https" : new URL(request.url).protocol === "https:";
}

function cache(): Map<string, { identity: RuoyiIdentity; expiresAt: number }> {
  return (globalThis.__piWebRuoyiIdentityCache ??= new Map());
}

/** 只接受 RuoYi /getInfo 已验证的用户标识，绝不信任浏览器传入的 userId。 */
export async function resolveRuoyiIdentityByAuthorization(authorization: string | undefined): Promise<IdentityResult> {
  if (!authorization) return { ok: false, status: 401, error: "缺少 RuoYi 用户令牌" };
  const url = baseUrl();
  if (!url) return { ok: false, status: 503, error: "RUOYI_API_BASE_URL 未配置" };

  const key = createHash("sha256").update(authorization).digest("hex");
  const cached = cache().get(key);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, identity: cached.identity };

  let response: Response;
  try {
    response = await fetch(`${url}/getInfo`, {
      headers: { Authorization: authorization, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { ok: false, status: 503, error: "无法连接 RuoYi 身份服务" };
  }
  const payload = await response.json().catch(() => null) as { code?: unknown; user?: { userId?: unknown }; permissions?: unknown } | null;
  const userId = payload?.user?.userId;
  if (!response.ok || Number(payload?.code) !== 200 || (typeof userId !== "number" && typeof userId !== "string")) {
    return { ok: false, status: 401, error: "RuoYi 用户令牌无效或已过期" };
  }
  const identity: RuoyiIdentity = {
    userId: String(userId),
    authorization,
    permissions: Array.isArray(payload?.permissions)
      ? payload.permissions.filter((permission): permission is string => typeof permission === "string")
      : [],
  };
  cache().set(key, { identity, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
  return { ok: true, identity };
}

export function resolveRuoyiIdentity(request: Request): Promise<IdentityResult> {
  return resolveRuoyiIdentityByAuthorization(readRuoyiAuthorization(request));
}

/** 工作区固定在 Pi Web 项目根目录，用户 ID 经净化和摘要处理后才进入路径。 */
export function ruoyiWorkspaceFor(userId: string): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return join(process.cwd(), `pi-cwd-${safeUserId}-${digest}`);
}

/** RuoYi 用户各自的侧边栏状态，不能回落到全局共享文件。 */
export function ruoyiSessionUiStatePath(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex");
  return join(getAgentDir(), "pi-web-ruoyi-session-state", `${digest}.json`);
}
