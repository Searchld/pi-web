import { Type } from "@earendil-works/pi-ai";
import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";

const EXTENSION_NAME = "pi-web-ruoyi-business-tools";
/** 业务工具名称由 RuoYi 注册表提供，前缀避免与 Pi 内置工具冲突。 */
export const BUSINESS_AGENT_TOOL_PREFIX = "system_business_";
const RAW_TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_QUERY_LENGTH = 500;

export type BusinessToolDefinition = {
  name: string;
  displayName: string;
  description: string;
};

function baseUrl(): string {
  const value = process.env.RUOYI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("RUOYI_API_BASE_URL 未配置");
  return value;
}

function normalizeAuthorization(value: string | undefined): string | undefined {
  const authorization = value?.trim();
  if (!authorization) return undefined;
  return /^Bearer\s+/i.test(authorization) ? authorization : `Bearer ${authorization}`;
}

async function ruoyiRequest(
  getAuthorization: () => string | undefined,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const authorization = normalizeAuthorization(getAuthorization());
  if (!authorization) throw new Error("缺少已验证的 RuoYi 用户令牌");
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`RuoYi 业务服务请求失败 (${response.status})`);
  if (payload && typeof payload === "object" && "code" in payload && Number(payload.code) !== 200) {
    throw new Error(typeof payload.msg === "string" ? payload.msg : "RuoYi 业务服务请求失败");
  }
  return payload;
}

function unwrapData(payload: unknown): unknown {
  return payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload;
}

/** 优先使用 RuoYi 已格式化的结果，减少模型泄漏内部字段的机会。 */
export function formatBusinessToolResult(payload: unknown): string {
  const data = unwrapData(payload);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const formattedContent = (data as Record<string, unknown>).formattedContent;
    if (typeof formattedContent === "string" && formattedContent.trim()) {
      return `以下是系统已校验并格式化的业务查询结果。请仅据此用中文回答；不得展示 JSON、内部字段名或原始表格分隔符，不得篡改数值、时间和统计范围。\n\n${formattedContent.trim()}`;
    }
  }
  return JSON.stringify(data);
}

/** 过滤不可信目录响应，避免服务端异常数据注册为任意 Pi 工具。 */
export function normalizeBusinessTools(payload: unknown): BusinessToolDefinition[] {
  const data = unwrapData(payload);
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data.flatMap((item): BusinessToolDefinition[] => {
    if (!item || typeof item !== "object") return [];
    const { name, displayName, description } = item as Record<string, unknown>;
    if (typeof name !== "string" || !RAW_TOOL_NAME_PATTERN.test(name) || seen.has(name)) return [];
    if (typeof description !== "string" || !description.trim()) return [];
    seen.add(name);
    return [{
      name,
      displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim() : name,
      description: description.trim(),
    }];
  });
}

export function isBusinessAgentToolName(name: string): boolean {
  return name.startsWith(BUSINESS_AGENT_TOOL_PREFIX)
    && RAW_TOOL_NAME_PATTERN.test(name.slice(BUSINESS_AGENT_TOOL_PREFIX.length));
}

/**
 * 仅把当前 RuoYi 用户在服务端目录中获授权的查询工具注册给会话。
 * 令牌通过闭包读取，刷新后无需将令牌写入会话文件或浏览器。
 */
export function createRuoyiBusinessToolsExtension(
  getAuthorization: () => string | undefined,
  onToolsLoaded?: (tools: readonly BusinessToolDefinition[]) => void,
): InlineExtension {
  return {
    name: EXTENSION_NAME,
    hidden: true,
    async factory(pi) {
      let tools: BusinessToolDefinition[];
      try {
        tools = normalizeBusinessTools(await ruoyiRequest(getAuthorization, "/agent/v1/business-tools"));
      } catch (error) {
        // 认证或业务服务异常时不降级为系统账号，也不注册任何业务工具。
        console.warn("无法加载当前 RuoYi 用户的业务工具", error);
        return;
      }
      onToolsLoaded?.(tools);

      for (const tool of tools) {
        pi.registerTool(defineTool({
          name: `${BUSINESS_AGENT_TOOL_PREFIX}${tool.name}`,
          label: tool.displayName,
          description: `${tool.description}。仅可查询当前用户获授权的数据，不得用于写入、删除或执行命令。`,
          parameters: Type.Object({
            query: Type.String({ description: "用户原始查询问题，最多 500 个字符", maxLength: MAX_QUERY_LENGTH }),
          }),
          async execute(_toolCallId, params) {
            const query = params.query.trim();
            if (!query || query.length > MAX_QUERY_LENGTH) {
              throw new Error("query 必填，且不得超过 500 个字符");
            }
            const payload = await ruoyiRequest(getAuthorization, "/agent/v1/business-tools/execute", {
              method: "POST",
              body: JSON.stringify({ toolName: tool.name, query }),
            });
            return {
              content: [{ type: "text", text: formatBusinessToolResult(payload) }],
              details: undefined,
            };
          },
        }));
      }
    },
  };
}
