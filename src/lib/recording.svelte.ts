// 녹음 (2026-10-18 휴대폰 상단 메뉴 → 2026-10-20 사용자: "말풍선 속성창에 녹음도 추가") — 상단 메뉴와 말풍선 창이 같은 녹음 하나를 쓴다.
// 누르면 시작, 다시 누르면 마치고 저장: 사인물이면 그 사인물의 음성 메모(kind 'voice' — 대화와 섞지 않고 카드 🎙n·상세 🎙 목록), 지점 말풍선이면 대화에 음성 첨부
import { app } from './state.svelte';
import { putAsset } from './assets';
import { VoiceRecorder } from './recorder';
import { baseMime, voiceFileName, voiceMemoText } from './core/attachments';

class Recording {
  recorder = $state<VoiceRecorder | null>(null);
  /** 녹음 중인 대상 (사인물 id 또는 지점 말풍선 id) */
  target = $state<string | null>(null);
  sec = $state(0);
  busy = $state(false);
  private timer = 0;

  /** 대상이 사인물(원본)이면 음성 메모, 아니면(지점 말풍선) 대화에 첨부 */
  private asMemo(id: string) { return app.objects.some((o) => o.id === id); }

  async toggle(target: string) {
    if (this.recorder) { await this.finish(); return; }
    if (!VoiceRecorder.supported()) { app.notice = '이 브라우저에서는 녹음을 쓸 수 없습니다.'; return; }
    const r = new VoiceRecorder();
    this.busy = true;
    try { await r.start(); this.recorder = r; this.target = target; this.sec = 0; this.timer = window.setInterval(() => { this.sec = r.seconds; }, 250); }
    catch { app.notice = '마이크를 쓸 수 없습니다. 브라우저의 마이크 허용을 확인해 주세요.'; }
    finally { this.busy = false; }
  }

  private async finish() {
    const r = this.recorder!, id = this.target!, sec = r.seconds;
    this.recorder = null; this.target = null; clearInterval(this.timer); this.busy = true;
    try {
      const blob = await r.stop();
      if (blob.size < 200 || sec < 0.5) { app.notice = '녹음이 너무 짧습니다.'; return; }
      const assetId = await putAsset(blob);
      const type = baseMime(blob.type || 'audio/webm');
      const att = [{ assetId, name: voiceFileName(type, new Date()), type, size: blob.size }];
      if (this.asMemo(id)) {
        await app.sendMessage(id, voiceMemoText(sec), 'voice', att);
        const msg = `${voiceMemoText(sec)} 저장 — 상세의 🎙 에서 들을 수 있습니다.`;
        app.notice = msg; window.setTimeout(() => { if (app.notice === msg) app.notice = ''; }, 3000);
      } else await app.sendMessage(id, voiceMemoText(sec), 'chat', att);
    } catch (e) { app.notice = `음성을 보내지 못했습니다: ${e instanceof Error ? e.message : e}`; }
    finally { this.busy = false; }
  }

  /** 버림 (선택이 풀리는 등) */
  cancel() {
    if (!this.recorder) return;
    this.recorder.cancel(); this.recorder = null; this.target = null; clearInterval(this.timer);
  }
}

export const recording = new Recording();
