import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolveSessionPath } from "./session-reader";
import { getRpcSession, startRpcSession, type AgentSessionWrapper } from "./rpc-manager";
import { ruoyiWorkspaceFor, type RuoyiIdentity } from "./ruoyi-identity";
import { toRuoyiChannelPolicy, type RuoyiAgentPolicy } from "./ruoyi-tool-policy";

const DEFAULT_TIMEOUT_MS = 180_000;

declare global {
  var __piWebRuoyiChannelLocks: Map<string, Promise<void>> | undefined;
}

export type RuoyiChannelResult = {
  sessionId: string;
  answer: string;
};

function timeoutMs(): number {
  const value = Number(process.env.PI_WEB_CHANNEL_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 600_000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

async function withUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const locks = (globalThis.__piWebRuoyiChannelLocks ??= new Map());
  const previous = locks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  locks.set(userId, queued);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (locks.get(userId) === queued) locks.delete(userId);
  }
}

function waitForAgentSettled(session: AgentSessionWrapper): {
  settled: Promise<{ aborted: boolean }>;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  let finished = false;
  const settled = new Promise<{ aborted: boolean }>((resolve, reject) => {
    const finish = (operation: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      operation();
    };
    unsubscribe = session.onEvent((event) => {
      if (event.type === "agent_settled") {
        finish(() => resolve({ aborted: event.aborted === true }));
      } else if (event.type === "prompt_error") {
        finish(() => reject(new Error(typeof event.errorMessage === "string"
          ? event.errorMessage
          : "Agent 回答失败")));
      } else if (event.type === "extension_ui_request") {
        finish(() => reject(new Error("企业微信通道不支持需要人工操作的 Agent 交互")));
      } else if (event.type === "session_shutdown") {
        finish(() => reject(new Error("Agent 会话已关闭")));
      }
    });
    if (finished) unsubscribe();
    else {
      timer = setTimeout(() => {
        finished = true;
        unsubscribe();
        reject(new Error("Agent 回答超时"));
      }, timeoutMs());
    }
  });
  return { settled, dispose: () => { clearTimeout(timer); unsubscribe(); } };
}

export async function runRuoyiChannelPrompt(options: {
  identity: RuoyiIdentity;
  policy: RuoyiAgentPolicy;
  systemPrompt: string | null;
  message: string;
  sessionId?: string;
}): Promise<RuoyiChannelResult> {
  return withUserLock(options.identity.userId, async () => {
    const workspace = ruoyiWorkspaceFor(options.identity.userId);
    await mkdir(workspace, { recursive: true });

    const policy = toRuoyiChannelPolicy(options.policy);
    const liveSession = options.sessionId ? getRpcSession(options.sessionId) : undefined;
    const sessionFile = options.sessionId
      ? liveSession?.sessionFile || await resolveSessionPath(options.sessionId)
      : "";
    if (options.sessionId && !liveSession?.isAlive() && !sessionFile) {
      throw new Error("Agent 会话不存在");
    }

    const started = await startRpcSession(
      options.sessionId ?? `__ruoyi_channel__${randomUUID()}`,
      sessionFile ?? "",
      options.sessionId ? undefined : workspace,
      {
        toolNames: policy.toolNames,
        forceToolNames: true,
        ruoyiAuthorization: options.identity.authorization,
        ruoyiPolicy: policy,
        ruoyiSystemPrompt: options.systemPrompt,
      },
    );
    const { session, realSessionId } = started;
    session.setRuoyiAuthorization(options.identity.authorization);
    session.setRuoyiPolicy(policy);
    session.setRuoyiSystemPrompt(options.systemPrompt);

    const completion = waitForAgentSettled(session);
    try {
      await session.send({ type: "prompt", message: options.message });
      const { aborted } = await completion.settled;
      if (aborted) throw new Error("Agent 回答已中止");
      const answer = await session.send({ type: "get_last_assistant_text" });
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Agent 未返回有效回答");
      return { sessionId: realSessionId, answer: answer.trim() };
    } catch (error) {
      completion.dispose();
      if (session.isRunning()) await session.send({ type: "abort" }).catch(() => undefined);
      throw error;
    }
  });
}
