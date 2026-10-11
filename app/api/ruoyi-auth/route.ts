import { NextResponse } from "next/server";
import { readRuoyiAuthorization, resolveRuoyiIdentityByAuthorization, RUOYI_TOKEN_COOKIE, shouldUseSecureRuoyiCookie } from "@/lib/ruoyi-identity";

const COOKIE_MAX_AGE_SECONDS = 60 * 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" && body.token.length <= 4096 ? body.token : "";
  const authorization = readRuoyiAuthorization(new Request(request.url, { headers: { "x-ruoyi-authorization": token } }));
  const identity = await resolveRuoyiIdentityByAuthorization(authorization);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: identity.status });
  const response = NextResponse.json({ success: true });
  response.cookies.set(RUOYI_TOKEN_COOKIE, identity.identity.authorization, {
    httpOnly: true, sameSite: "lax", secure: shouldUseSecureRuoyiCookie(request), maxAge: COOKIE_MAX_AGE_SECONDS, path: "/",
  });
  return response;
}

export function DELETE(request: Request) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(RUOYI_TOKEN_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: shouldUseSecureRuoyiCookie(request), maxAge: 0, path: "/",
  });
  return response;
}
