import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./DigitalHumanPanel.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("业务助手等待数字人就绪后再起播，并预取下一段语音", () => {
  assert.match(source, /const FRAME_VISIBLE_DELAY = 160/);
  assert.match(source, /const waitForFrameVisible =/);
  assert.match(source, /await waitForFrameVisible\(controller\.signal\)/);
  assert.match(source, /const prefetchNextSpeech =/);
  assert.match(source, /const prefetchNextWhilePlaying =/);
  assert.match(source, /audio && !audio\.paused && !audio\.ended/);
  assert.match(source, /prefetchNextSpeech\(\);/);
  assert.match(source, /const takeSpeechPrefetch =/);
  assert.match(source, /onReady\?\.\(\);/);
});

test("业务助手以实际播放时间校准 Safari 口型，并能中断当前播放", () => {
  assert.match(source, /type: "dh-live-animation-clock", currentTime: audio\.currentTime/);
  assert.match(source, /if \(!isSafariBrowser\) return/);
  assert.match(source, /activePlaybackCompleteRef\.current\?\.\(\)/);
  assert.match(source, /stopAnimationClock\(\);/);
});

test("业务助手字幕气泡随首个文字出现并按文字收窄", () => {
  assert.match(source, /captionVisible && caption && <div className="digital-human-panel__caption"/);
  assert.match(styles, /\.digital-human-panel__caption \{[\s\S]*?width: fit-content;[\s\S]*?max-width: calc\(100% - 28px\);/);
  assert.match(styles, /transform: translateX\(-50%\) translateY\(4px\);/);
});

test("业务助手将语音开关保存到当前 RuoYi 账号", () => {
  assert.match(source, /const toggleVoice = async/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /JSON\.stringify\(\{ voiceEnabled: nextVoiceEnabled \}\)/);
  assert.match(source, /disabled=\{!voicePreferenceReady \|\| voicePreferenceSaving\}/);
  assert.match(source, /setVoiceEnabled\(!nextVoiceEnabled\)/);
});

test("业务助手允许用户手动播报已完成回答", () => {
  assert.match(source, /speakAnswer: \(text: string\) => void/);
  assert.match(source, /const speakAnswer = \(text: string\)/);
  assert.match(source, /const drain = \(manual = false\)/);
  assert.match(source, /drain\(true\)/);
});
