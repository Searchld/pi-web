import { NextResponse, type NextRequest } from "next/server";
import {
  getAuthRetryAfterMs,
  recordAuthFailure,
  retryAfterSeconds,
} from "@/lib/auth-throttle";
import {
  isApiRequestAllowed,
  isApiRequestHostAllowed,
} from "@/lib/request-security";
import {
  isValidWebSessionToken,
  isValidBasicAuthorization,
  isWebPasswordEnabled,
  PI_WEB_SESSION_COOKIE,
} from "@/lib/web-auth";
import { getRuoyiEmbedOrigins } from "@/lib/ruoyi-embed-origins";
import { resolveRuoyiIdentity } from "@/lib/ruoyi-identity";

// 这些高频路由自身调用 requireRuoyiChatAccess / requireIntegrationSessionAccess。
function hasRouteLevelRuoyiCheck(pathname: string, method: string): boolean {
  if (pathname === "/api/ruoyi-workspace") return method === "POST";
  if (pathname === "/api/ruoyi-workbench/session") return method === "GET" || method === "POST";
  if (pathname === "/api/agent/running" || pathname === "/api/sessions") return method === "GET";
  if (pathname === "/api/sessions/ui-state") return method === "GET" || method === "POST";
  const session = /^\/api\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(state|context))?$/i.exec(pathname);
  if (session) return session[2] ? method === "GET" : ["GET", "PATCH", "DELETE"].includes(method);
  const match = /^\/api\/agent\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(events|lease))?$/i.exec(pathname);
  if (!match) return false;
  if (match[2] === "events") return method === "GET";
  if (match[2] === "lease") return method === "POST";
  return method === "GET" || method === "POST";
}

function tooManyAttempts(retryAfterMs: number): NextResponse {
  return new NextResponse("Too many failed attempts", {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfterSeconds(retryAfterMs)),
    },
  });
}

export async function proxy(request: NextRequest) {
  const basePath = request.nextUrl.basePath;
  const pathname = basePath && request.nextUrl.pathname.startsWith(basePath)
    ? request.nextUrl.pathname.slice(basePath.length) || "/"
    : request.nextUrl.pathname;
  const isApiRequest = pathname === "/api" || pathname.startsWith("/api/");
  const isTrustedRequest = isApiRequest
    ? isApiRequestAllowed(request)
    : isApiRequestHostAllowed(request);

  if (!isTrustedRequest) {
    if (!isApiRequest) {
      return new NextResponse("Untrusted request", { status: 403 });
    }
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  // 默认由此校验身份；明确列出的高频路由在处理时自行校验身份、权限和资源归属。
  if (process.env.RUOYI_API_BASE_URL?.trim()) {
    const isRuoyiAuthBootstrap = pathname === "/api/ruoyi-auth"
      && (request.method === "POST" || request.method === "DELETE");
    if (isApiRequest && !isRuoyiAuthBootstrap && !hasRouteLevelRuoyiCheck(pathname, request.method)) {
      const identity = await resolveRuoyiIdentity(request);
      if (!identity.ok) {
        return NextResponse.json({ error: identity.error }, {
          status: identity.status,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const response = NextResponse.next();
    if (!isApiRequest) {
      const origins = getRuoyiEmbedOrigins(process.env.NEXT_PUBLIC_RUOYI_EMBED_ORIGIN);
      if (origins.length) response.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${origins.join(" ")}`);
    }
    return response;
  }

  const password = process.env.PI_WEB_PASSWORD;
  if (!isWebPasswordEnabled(password)) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  let authenticated = isValidWebSessionToken(request.cookies.get(PI_WEB_SESSION_COOKIE)?.value, password);
  const authorization = isApiRequest ? request.headers.get("authorization") : null;
  if (!authenticated && authorization && /^Basic\s/i.test(authorization)) {
    // Every Basic header is a password guess, so it shares the login form's
    // throttle; otherwise any API path (or GET /api/web-auth) answers guesses
    // at full speed. While blocked even the right password is refused, or the
    // answer would leak. A success does not reset the counter: Basic clients
    // authenticate on every request, and each reset would hand an interleaved
    // guesser a fresh short block.
    const retryAfterMs = getAuthRetryAfterMs();
    if (retryAfterMs > 0) return tooManyAttempts(retryAfterMs);
    authenticated = isValidBasicAuthorization(authorization, password);
    if (!authenticated) recordAuthFailure();
  }
  if (pathname === "/login") {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }
  if (pathname === "/api/web-auth") return NextResponse.next();

  if (!authenticated) {
    if (!isApiRequest) {
      const loginUrl = new URL("/login", request.url);
      if (request.nextUrl.search) {
        loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      }
      return NextResponse.redirect(loginUrl);
    }
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Basic realm="Pi Web", charset="UTF-8"',
      },
    });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/api/:path*", "/xi-web", "/xi-web/:path*"] };
