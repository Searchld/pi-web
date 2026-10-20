"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

export type DigitalHumanHandle = {
  start: () => void;
  append: (text: string) => void;
  finish: () => void;
  stop: () => void;
  speakAnswer: (text: string) => void;
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
  onReady?: () => void;
};

type SpeechPrefetch = {
  text: string;
  controller: AbortController;
  promise: Promise<ArrayBuffer | null>;
};

const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  voice: "zh-CN-YunyangNeural",
  speed: 1,
  pitch: "0",
  style: "general",
};
const MAX_SPEECH_SEGMENT_LENGTH = 34;
const FRAME_VISIBLE_DELAY = 160;
const DIGITAL_HUMAN_LIVE_URL = process.env.NEXT_PUBLIC_DH_LIVE_URL ?? "https://live.beta.kim/static/GuideLive.html";
const isSafariBrowser = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(navigator.userAgent);

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
export const DigitalHumanPanel = forwardRef<DigitalHumanHandle, DigitalHumanPanelProps>(function DigitalHumanPanel({ onClose, onReady }, ref) {
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
  const frameReadyResolversRef = useRef(new Set<() => void>());
  const captionFrameRef = useRef<number | null>(null);
  const animationClockFrameRef = useRef<number | null>(null);
  const activePlaybackCompleteRef = useRef<(() => void) | null>(null);
  const prefetchRef = useRef<SpeechPrefetch | null>(null);
  const controlsRef = useRef<DigitalHumanHandle | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voicePreferenceReady, setVoicePreferenceReady] = useState(false);
  const [voicePreferenceSaving, setVoicePreferenceSaving] = useState(false);
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
        setVoicePreferenceReady(true);
      })
      .catch(() => {
        if (!active) return;
        setAvatarAsset("assets1");
        setVoicePreferenceReady(true);
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
    if (isSafariBrowser) {
      target.postMessage({ type: "dh-live-animation-audio", audio }, "*");
      return;
    }
    target.postMessage({ type: "dh-live-animation-audio", audio }, "*", [audio]);
  };

  const stopAnimationClock = () => {
    if (animationClockFrameRef.current !== null) cancelAnimationFrame(animationClockFrameRef.current);
    animationClockFrameRef.current = null;
  };

  /** Safari 的媒体与 iframe 不共用帧时钟，持续回传真实进度避免口型越播越慢。 */
  const syncAnimationWithAudio = (audio: HTMLAudioElement, speechId: number) => {
    stopAnimationClock();
    if (!isSafariBrowser) return;
    const sync = () => {
      if (speechId !== speechIdRef.current || audioRef.current !== audio) return;
      frameRef.current?.contentWindow?.postMessage({ type: "dh-live-animation-clock", currentTime: audio.currentTime }, "*");
      if (!audio.paused && !audio.ended) animationClockFrameRef.current = requestAnimationFrame(sync);
    };
    sync();
  };

  const cancelPrefetch = () => {
    prefetchRef.current?.controller.abort();
    prefetchRef.current = null;
  };

  const waitForFrameDelay = (signal: AbortSignal) => new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve(!signal.aborted);
    };
    const timer = window.setTimeout(finish, FRAME_VISIBLE_DELAY);
    signal.addEventListener("abort", finish, { once: true });
  });

  /** 等媒体页完成初始化并淡入后再播放，避免首句先出声、口型稍后才开始。 */
  const waitForFrameVisible = (signal: AbortSignal) => {
    if (frameReadyRef.current) return waitForFrameDelay(signal);
    return new Promise<boolean>((resolve) => {
      if (signal.aborted) {
        resolve(false);
        return;
      }
      const onReady = () => {
        signal.removeEventListener("abort", onAbort);
        void waitForFrameDelay(signal).then(resolve);
      };
      const onAbort = () => {
        frameReadyResolversRef.current.delete(onReady);
        resolve(false);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      frameReadyResolversRef.current.add(onReady);
    });
  };

  const fetchSpeechAudio = async (text: string, signal: AbortSignal, settings: SpeechSettings) => {
    const response = await fetch(getSpeechEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...settings }),
      signal,
    });
    if (!response.ok) throw new Error("小锡语音服务请求失败");
    const audioBlob = await response.blob();
    if (!audioBlob.size) throw new Error("小锡语音服务未返回音频");
    return audioBlob.arrayBuffer();
  };

  /** 当前段实际起播后仅预取下一段，消除段间网络等待且不抢占整段回答的带宽。 */
  const prefetchNextSpeech = () => {
    const text = queueRef.current[0];
    if (!text || prefetchRef.current?.text === text) return;
    cancelPrefetch();
    const controller = new AbortController();
    prefetchRef.current = {
      text,
      controller,
      promise: fetchSpeechAudio(text, controller.signal, settingsRef.current).catch(() => null),
    };
  };

  /** 只有用户已实际听到当前段时，才允许为下一段提前请求音频。 */
  const prefetchNextWhilePlaying = () => {
    const audio = audioRef.current;
    if (audio && !audio.paused && !audio.ended) prefetchNextSpeech();
  };

  const takeSpeechPrefetch = (text: string) => {
    const prefetched = prefetchRef.current;
    if (!prefetched || prefetched.text !== text) {
      cancelPrefetch();
      return null;
    }
    prefetchRef.current = null;
    return prefetched;
  };

  const stop = () => {
    speechIdRef.current += 1;
    pendingTextRef.current = "";
    queueRef.current = [];
    pendingAnimationAudioRef.current = null;
    cancelPrefetch();
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
    activePlaybackCompleteRef.current?.();
    activePlaybackCompleteRef.current = null;
    frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
    if (captionFrameRef.current !== null) cancelAnimationFrame(captionFrameRef.current);
    captionFrameRef.current = null;
    stopAnimationClock();
    frameReadyResolversRef.current.forEach((resolve) => resolve());
    frameReadyResolversRef.current.clear();
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
      const revealedCount = Math.min(text.length, Math.max(1, Math.ceil((audio.currentTime / duration) * text.length)));
      const segments = text.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) ?? [text];
      let consumedCount = 0;
      for (const segment of segments) {
        const nextConsumedCount = consumedCount + segment.length;
        if (revealedCount <= nextConsumedCount) {
          setCaption(segment.slice(0, Math.max(1, revealedCount - consumedCount)));
          break;
        }
        consumedCount = nextConsumedCount;
      }
      if (!audio.paused && !audio.ended) captionFrameRef.current = requestAnimationFrame(paint);
    };
    paint();
  };

  const speak = async (text: string, speechId: number) => {
    const prefetched = takeSpeechPrefetch(text);
    const controller = prefetched?.controller ?? new AbortController();
    abortRef.current = controller;
    try {
      const wav = await (prefetched?.promise ?? fetchSpeechAudio(text, controller.signal, settingsRef.current));
      if (!wav || controller.signal.aborted || speechId !== speechIdRef.current) return;
      if (!await waitForFrameVisible(controller.signal) || speechId !== speechIdRef.current) return;
      if (controller.signal.aborted || speechId !== speechIdRef.current) return;
      const objectUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audioRef.current = audio;
      audioUrlRef.current = objectUrl;
      let captionStarted = false;
      await new Promise<void>((resolve) => {
        let completed = false;
        const complete = () => {
          if (completed) return;
          completed = true;
          if (audioRef.current === audio) audioRef.current = null;
          if (audioUrlRef.current === objectUrl) audioUrlRef.current = null;
          URL.revokeObjectURL(objectUrl);
          frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
          if (captionFrameRef.current !== null) cancelAnimationFrame(captionFrameRef.current);
          captionFrameRef.current = null;
          setCaption("");
          setCaptionVisible(false);
          setPaused(false);
          stopAnimationClock();
          if (activePlaybackCompleteRef.current === complete) activePlaybackCompleteRef.current = null;
          resolve();
        };
        activePlaybackCompleteRef.current = complete;
        audio.onended = complete;
        audio.onerror = complete;
        audio.onplaying = () => {
          if (speechId !== speechIdRef.current || audioRef.current !== audio) return;
          sendAnimationAudio(wav.slice(0));
          streamCaption(audio, text, speechId, !captionStarted);
          captionStarted = true;
          setPaused(false);
          syncAnimationWithAudio(audio, speechId);
          prefetchNextSpeech();
        };
        audio.onpause = () => {
          if (audio.ended || captionFrameRef.current === null) return;
          cancelAnimationFrame(captionFrameRef.current);
          captionFrameRef.current = null;
          stopAnimationClock();
        };
        void audio.play().catch(complete);
      });
    } catch {
      // 语音失败不干扰文字回答，队列仍会继续处理下一句。
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const drain = (manual = false) => {
    const speechId = speechIdRef.current;
    if (drainingRef.current || (!manual && !voiceEnabled)) return;
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
        if (queueRef.current.length && (manual || voiceEnabled)) drain(manual);
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
    prefetchNextWhilePlaying();
    drain();
  };

  const finish = () => {
    if (!voiceEnabled) return;
    if (pendingTextRef.current.trim()) splitSpeechSegments(pendingTextRef.current).forEach((item) => queueRef.current.push(item));
    pendingTextRef.current = "";
    prefetchNextWhilePlaying();
    drain();
  };

  // 手动播报代表用户的明确操作，不受“回答生成时自动播报”开关限制。
  const speakAnswer = (text: string) => {
    const segments = splitSpeechSegments(text);
    if (segments.length === 0) return;
    stop();
    queueRef.current.push(...segments);
    drain(true);
  };

  const toggleVoice = async () => {
    if (!voicePreferenceReady || voicePreferenceSaving) return;
    const nextVoiceEnabled = !voiceEnabled;
    if (!nextVoiceEnabled) stop();
    setVoiceEnabled(nextVoiceEnabled);
    setVoicePreferenceSaving(true);
    try {
      const response = await fetch("/api/ruoyi-digital-human", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceEnabled: nextVoiceEnabled }),
      });
      if (!response.ok) throw new Error("语音偏好保存失败");
    } catch {
      setVoiceEnabled(!nextVoiceEnabled);
    } finally {
      setVoicePreferenceSaving(false);
    }
  };

  controlsRef.current = { start: stop, append, finish, stop, speakAnswer };
  useImperativeHandle(ref, () => ({
    start: () => controlsRef.current?.start(),
    append: (text) => controlsRef.current?.append(text),
    finish: () => controlsRef.current?.finish(),
    stop: () => controlsRef.current?.stop(),
    speakAnswer: (text) => controlsRef.current?.speakAnswer(text),
  }), []);

  useEffect(() => () => stop(), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "dh-live-ready") return;
      frameReadyRef.current = true;
      setFrameReady(true);
      frameReadyResolversRef.current.forEach((resolve) => resolve());
      frameReadyResolversRef.current.clear();
      onReady?.();
      const pending = pendingAnimationAudioRef.current;
      if (pending) {
        pendingAnimationAudioRef.current = null;
        sendAnimationAudio(pending);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onReady]);

  return (
    <section className={`digital-human-panel${speaking ? " is-speaking" : ""}${paused ? " is-paused" : ""}`} aria-label="业务助手">
      <header className="digital-human-panel__header">
        <span className="digital-human-panel__presence"><i />数字员工001号</span>
        <button
          type="button"
          className="digital-human-panel__voice"
          onClick={() => { void toggleVoice(); }}
          disabled={!voicePreferenceReady || voicePreferenceSaving}
          aria-busy={voicePreferenceSaving}
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
        {captionVisible && caption && <div className="digital-human-panel__caption" aria-live="polite">{caption}</div>}
      </div>
      <footer className="digital-human-panel__status">
        <i />
        <span>{paused ? "播报已暂停" : speaking ? "正在播报回答" : !voiceEnabled ? "语音播报已关闭" : "将在回答生成时播报"}</span>
        {speaking && audioRef.current && (
          <button type="button" onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) {
              void audio.play();
            } else {
              audio.pause();
              frameRef.current?.contentWindow?.postMessage({ type: "dh-live-stop" }, "*");
              stopAnimationClock();
              setPaused(true);
            }
          }}>{paused ? "继续" : "暂停"}</button>
        )}
      </footer>
    </section>
  );
});
