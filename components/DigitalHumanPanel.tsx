"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type DigitalHumanHandle = {
  start: () => void;
  append: (text: string) => void;
  finish: () => void;
  stop: () => void;
};

type SpeechSettings = {
  voice: string;
  speed: number;
  pitch: string;
  style: string;
};

type UserSettingsResponse = {
  settings?: Record<string, string>;
};

type DigitalHumanPanelProps = {
  onClose?: () => void;
};

const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  voice: "zh-CN-YunyangNeural",
  speed: 1,
  pitch: "0",
  style: "general",
};
const MAX_SPEECH_SEGMENT_LENGTH = 34;
const DIGITAL_HUMAN_LIVE_URL = process.env.NEXT_PUBLIC_DH_LIVE_URL ?? "https://live.beta.kim/static/GuideLive.html";

function getSpeechEndpoint(): string {
  return process.env.NEXT_PUBLIC_XIAOXI_TTS_ENDPOINT
    ?? `${new URL(DIGITAL_HUMAN_LIVE_URL).origin}/guide_speech`;
}

function readSpeechSettings(values: Record<string, string>, asset: string): SpeechSettings {
  if (values["ui.datun-tour.customized"] !== "true") return DEFAULT_SPEECH_SETTINGS;
  try {
    const overrides = JSON.parse(values["ui.datun-tour.avatar-settings"] ?? "{}") as Record<string, Partial<SpeechSettings>>;
    const current = overrides[asset];
    if (!current) return DEFAULT_SPEECH_SETTINGS;
    return {
      voice: typeof current.voice === "string" ? current.voice : DEFAULT_SPEECH_SETTINGS.voice,
      speed: Number.isFinite(Number(current.speed)) ? Number(current.speed) : DEFAULT_SPEECH_SETTINGS.speed,
      pitch: typeof current.pitch === "string" ? current.pitch : DEFAULT_SPEECH_SETTINGS.pitch,
      style: typeof current.style === "string" ? current.style : DEFAULT_SPEECH_SETTINGS.style,
    };
  } catch {
    return DEFAULT_SPEECH_SETTINGS;
  }
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeechSegments(text: string): string[] {
  const result: string[] = [];
  let remaining = normalizeSpeechText(text);
  while (remaining) {
    if (remaining.length <= MAX_SPEECH_SEGMENT_LENGTH) {
      result.push(remaining);
      break;
    }
    const candidate = remaining.slice(0, MAX_SPEECH_SEGMENT_LENGTH);
    const boundary = Math.max(...["。", "！", "？", "；", "，", "、", "：", "!", "?", ";", ",", ":"].map((mark) => candidate.lastIndexOf(mark)));
    const length = boundary >= 0 ? boundary + 1 : MAX_SPEECH_SEGMENT_LENGTH;
    result.push(remaining.slice(0, length).trim());
    remaining = remaining.slice(length).trim();
  }
  return result.filter(Boolean);
}

/** RuoYi 数字人服务的 Pi 原生面板，页面仅保存当前用户已有的偏好，不保存令牌。 */
export const DigitalHumanPanel = forwardRef<DigitalHumanHandle, DigitalHumanPanelProps>(function DigitalHumanPanel({ onClose }, ref) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speechIdRef = useRef(0);
  const pendingTextRef = useRef("");
  const queueRef = useRef<string[]>([]);
  const drainingRef = useRef(false);
  const pendingAnimationAudioRef = useRef<ArrayBuffer | null>(null);
  const frameReadyRef = useRef(false);
  const captionFrameRef = useRef<number | null>(null);
  const controlsRef = useRef<DigitalHumanHandle | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [caption, setCaption] = useState("");
  const [captionVisible, setCaptionVisible] = useState(false);
  // 先确认用户设置再挂载媒体页，避免默认形象闪现后又切换。
  const [avatarAsset, setAvatarAsset] = useState<string | null>(null);
  const settingsRef = useRef<SpeechSettings>(DEFAULT_SPEECH_SETTINGS);

  const liveUrl = useMemo(() => {
    if (!avatarAsset) return null;
    const url = new URL(DIGITAL_HUMAN_LIVE_URL);
    url.searchParams.set("asset", avatarAsset);
    return url.toString();
  }, [avatarAsset]);

  useEffect(() => {
    let active = true;
    void fetch("/api/ruoyi-digital-human", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<UserSettingsResponse> : null)
      .then((response) => {
        if (!active) return;
        const values = response?.settings ?? {};
        const configuredAsset = values["ui.datun-tour.avatar"];
        const asset = configuredAsset && /^assets\d+$/.test(configuredAsset) ? configuredAsset : "assets1";
        setAvatarAsset(asset);
        settingsRef.current = readSpeechSettings(values, asset);
        setVoiceEnabled(values["ui.console-pet.voice-enabled"] !== "false");
      })
      .catch(() => {
        if (active) setAvatarAsset("assets1");
      });
    return () => { active = false; };
  }, []);

  const sendAnimationAudio = (audio: ArrayBuffer) => {
    const target = frameRef.current?.contentWindow;
    if (!frameReadyRef.current || !target) {
      pendingAnimationAudioRef.current = audio;
      return;
    }
    // Safari 对跨源 transferable ArrayBuffer 的口型缓冲支持不稳定，保留副本即可。
    if (/^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent)) {
      target.postMessage({ type: "dh-live-animation-audio", audio }, "*");
      return;
    }
    target.postMessage({ type: "dh-live-animation-audio", audio }, "*", [audio]);
  };

  const stop = () => {
    speechIdRef.current += 1;
    pendingTextRef.current = "";
    queueRef.current = [];
    pendingAnimationAudioRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    const objectUrl = audioUrlRef.current;
    audioRef.current = null;
    audioUrlRef.current = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
    if (captionFrameRef.current !== null) cancelAnimationFrame(captionFrameRef.current);
    captionFrameRef.current = null;
    setCaption("");
    setCaptionVisible(false);
    setPaused(false);
    setSpeaking(false);
  };

  const streamCaption = (audio: HTMLAudioElement, text: string, speechId: number, fresh: boolean) => {
    if (captionFrameRef.current !== null) cancelAnimationFrame(captionFrameRef.current);
    if (fresh) {
      setCaptionVisible(true);
      setCaption("");
    }
    const paint = () => {
      captionFrameRef.current = null;
      if (speechId !== speechIdRef.current) return;
      // WAV 已加载完成时可按真实时长推进；异常元数据才按正常中文语速兜底。
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : Math.max(text.length * 0.18, 1);
      const length = Math.min(text.length, Math.max(1, Math.ceil((audio.currentTime / duration) * text.length)));
      setCaption(text.slice(0, length));
      if (!audio.paused && !audio.ended) captionFrameRef.current = requestAnimationFrame(paint);
    };
    paint();
  };

  const speak = async (text: string, speechId: number) => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(getSpeechEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...settingsRef.current }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("小锡语音服务请求失败");
      const audioBlob = await response.blob();
      if (!audioBlob.size || controller.signal.aborted || speechId !== speechIdRef.current) return;
      const wav = await audioBlob.arrayBuffer();
      if (controller.signal.aborted || speechId !== speechIdRef.current) return;
      const objectUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audioRef.current = audio;
      audioUrlRef.current = objectUrl;
      let captionStarted = false;
      await new Promise<void>((resolve) => {
        const complete = () => {
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === objectUrl) audioUrlRef.current = null;
          URL.revokeObjectURL(objectUrl);
          frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
          if (captionFrameRef.current !== null) cancelAnimationFrame(captionFrameRef.current);
          captionFrameRef.current = null;
          setCaption("");
          setCaptionVisible(false);
          setPaused(false);
          resolve();
        };
        audio.onended = complete;
        audio.onerror = complete;
        audio.onplaying = () => {
          if (speechId !== speechIdRef.current || audioRef.current !== audio) return;
          sendAnimationAudio(wav.slice(0));
          streamCaption(audio, text, speechId, !captionStarted);
          captionStarted = true;
          setPaused(false);
        };
        audio.onpause = () => {
          if (audio.ended || captionFrameRef.current === null) return;
          cancelAnimationFrame(captionFrameRef.current);
          captionFrameRef.current = null;
        };
        void audio.play().catch(complete);
      });
    } catch {
      // 语音失败不干扰文字回答，队列仍会继续处理下一句。
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const drain = () => {
    const speechId = speechIdRef.current;
    if (drainingRef.current || !voiceEnabled) return;
    drainingRef.current = true;
    void (async () => {
      try {
        while (queueRef.current.length && speechId === speechIdRef.current) {
          const sentence = queueRef.current.shift();
          if (!sentence) continue;
          setSpeaking(true);
          await speak(sentence, speechId);
        }
      } finally {
        drainingRef.current = false;
        if (speechId === speechIdRef.current) setSpeaking(false);
        if (queueRef.current.length && voiceEnabled) drain();
      }
    })();
  };

  const append = (text: string) => {
    if (!voiceEnabled || !text) return;
    pendingTextRef.current += text;
    const completedAt = Math.max(...["。", "！", "？", "!", "?", "；", ";", "\n"].map((mark) => pendingTextRef.current.lastIndexOf(mark)));
    if (completedAt < 0) return;
    const completed = pendingTextRef.current.slice(0, completedAt + 1);
    pendingTextRef.current = pendingTextRef.current.slice(completedAt + 1);
    splitSpeechSegments(completed).forEach((item) => queueRef.current.push(item));
    drain();
  };

  const finish = () => {
    if (!voiceEnabled) return;
    if (pendingTextRef.current.trim()) splitSpeechSegments(pendingTextRef.current).forEach((item) => queueRef.current.push(item));
    pendingTextRef.current = "";
    drain();
  };

  controlsRef.current = { start: stop, append, finish, stop };
  useImperativeHandle(ref, () => ({
    start: () => controlsRef.current?.start(),
    append: (text) => controlsRef.current?.append(text),
    finish: () => controlsRef.current?.finish(),
    stop: () => controlsRef.current?.stop(),
  }), []);

  useEffect(() => () => stop(), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "dh-live-ready") return;
      frameReadyRef.current = true;
      setFrameReady(true);
      const pending = pendingAnimationAudioRef.current;
      if (pending) {
        pendingAnimationAudioRef.current = null;
        sendAnimationAudio(pending);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <section className={`digital-human-panel${speaking ? " is-speaking" : ""}${paused ? " is-paused" : ""}`} aria-label="业务助手">
      <header className="digital-human-panel__header">
        <span className="digital-human-panel__presence"><i />业务助手在线</span>
        <button
          type="button"
          className="digital-human-panel__voice"
          onClick={() => {
            if (voiceEnabled) stop();
            setVoiceEnabled((enabled) => !enabled);
          }}
          title={voiceEnabled ? "关闭语音播报" : "开启语音播报"}
          aria-label={voiceEnabled ? "关闭语音播报" : "开启语音播报"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {voiceEnabled ? <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="m16 9 5 5m0-5-5 5" /></>}
          </svg>
        </button>
        {onClose && (
          <button
            type="button"
            className="digital-human-panel__close"
            onClick={onClose}
            title="隐藏业务助手"
            aria-label="隐藏业务助手"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3" />
              <path d="M5 21a7 7 0 0 1 14 0M19 4v4m2-2h-4" />
            </svg>
          </button>
        )}
      </header>
      <div className={`digital-human-panel__stage${frameReady ? " is-ready" : ""}`}>
        {liveUrl && <iframe ref={frameRef} src={liveUrl} title="业务助手数字人" allow="autoplay" onLoad={() => {
          frameReadyRef.current = false;
          setFrameReady(false);
          window.setTimeout(() => frameRef.current?.contentWindow?.postMessage({ type: "dh-live-ping" }, "*"), 100);
        }} />}
        {!frameReady && <div className="digital-human-panel__loading">数字人加载中</div>}
        {captionVisible && <div className="digital-human-panel__caption" aria-live="polite">{caption}</div>}
      </div>
      <footer className="digital-human-panel__status">
        <i />
        <span>{!voiceEnabled ? "语音播报已关闭" : paused ? "播报已暂停" : speaking ? "正在播报回答" : "将在回答生成时播报"}</span>
        {speaking && audioRef.current && (
          <button type="button" onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) {
              void audio.play();
              setPaused(false);
            } else {
              audio.pause();
              frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
              setPaused(true);
            }
          }}>{paused ? "继续" : "暂停"}</button>
        )}
      </footer>
    </section>
  );
});
