export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // 压缩交给 Next.js 或反向代理，避免响应体已压缩但编码头被框架移除。
  return new Response(JSON.stringify(data), { ...init, headers });
}
