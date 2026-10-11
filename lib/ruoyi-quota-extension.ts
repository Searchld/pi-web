import { randomUUID } from "node:crypto";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { RuoyiModelPolicy } from "./ruoyi-tool-policy";

const TIMEOUT_MS = 10_000;

type Usage = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };

function baseUrl(): string {
  const value = process.env.RUOYI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("RUOYI_API_BASE_URL 未配置");
  return value;
}

async function request(authorization: string | undefined, path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!authorization) throw new Error("缺少已验证的 RuoYi 用户令牌");
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null) as { code?: unknown; msg?: unknown } | null;
  if (!response.ok || Number(payload?.code) !== 200) {
    throw new Error(typeof payload?.msg === "string" ? payload.msg : "模型额度校验失败");
  }
  return payload && typeof payload === "object" && "data" in payload ? (payload as { data?: unknown }).data : payload;
}

function usageOf(messages: unknown): Usage | null {
  if (!Array.isArray(messages)) return null;
  let found = false;
  const total: Required<Usage> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const entry of messages) {
    const usage = entry && typeof entry === "object" && "usage" in entry
      ? (entry as { usage?: unknown }).usage : undefined;
    if (!usage || typeof usage !== "object") continue;
    const record = usage as Usage;
    const values: Array<keyof Usage> = ["input", "output", "cacheRead", "cacheWrite"];
    if (!values.every((key) => record[key] === undefined || (typeof record[key] === "number" && Number.isFinite(record[key]) && record[key]! >= 0))) {
      return null;
    }
    for (const key of values) total[key] += record[key] ?? 0;
    found = true;
  }
  return found ? total : null;
}

/**
 * 模型调用前预留最坏额度，结束后以供应商 usage 结算。缺少 usage 时不释放预留，
 * 当前会话也停止继续调用，避免供应商异常时绕过成本控制。
 */
export function createRuoyiQuotaExtension(
  getAuthorization: () => string | undefined,
  getPolicy: () => RuoyiModelPolicy | undefined,
  sessionId: string,
): InlineExtension {
  return {
    name: "pi-web-ruoyi-quota",
    hidden: true,
    factory: (pi) => {
      let reservationId: string | undefined;
      let usageFailure = false;
      pi.on("before_agent_start", async (_event, ctx) => {
        if (usageFailure) throw new Error("上一轮模型未返回用量，当前会话已暂停，请稍后重试或联系管理员。");
        const policy = getPolicy();
        const model = ctx.model;
        if (!policy?.modelManaged || !model || !policy.models.some((item) => item.provider === model.provider && item.modelId === model.id)) {
          throw new Error("当前账户未获得此模型权限");
        }
        const requestId = randomUUID();
        const reservation = await request(getAuthorization(), "/agent/v1/quota/reserve", {
          requestId,
          provider: model.provider,
          modelId: model.id,
          sessionId,
        });
        const reservationIdValue = reservation && typeof reservation === "object" && "reservationId" in reservation
          ? (reservation as { reservationId?: unknown }).reservationId : undefined;
        if (typeof reservationIdValue !== "string" || !reservationIdValue) throw new Error("额度预留响应无效");
        reservationId = reservationIdValue;
      });
      pi.on("agent_end", async (event) => {
        if (!reservationId) return;
        const usage = usageOf(event.messages);
        if (!usage) {
          usageFailure = true;
          return;
        }
        const current = reservationId;
        reservationId = undefined;
        try {
          await request(getAuthorization(), "/agent/v1/quota/settle", {
            reservationId: current,
            inputTokens: usage.input ?? 0,
            outputTokens: usage.output ?? 0,
            cacheReadTokens: usage.cacheRead ?? 0,
            cacheWriteTokens: usage.cacheWrite ?? 0,
          });
        } catch (error) {
          usageFailure = true;
          throw error;
        }
      });
    },
  };
}
