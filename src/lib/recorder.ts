// 음성 메모 녹음 (2026-10-18 사용자: "모바일에서 사인물 선택하면 나오는 상단 메뉴에 녹음 버튼"): 마이크 → MediaRecorder → Blob.
// 현장에서 휴대폰으로 사인물마다 말로 메모를 남기고, 그 사인물의 말풍선(대화)에 첨부로 보낸다. 브라우저 전용(DOM) — 형식 고르기 등 순수 부분은 core/attachments.ts
import { baseMime, pickAudioMime } from './core/attachments';

export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  /** 녹음 시작 시각 (ms) */
  startedAt = 0;
  mime = '';

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }
  /** 마이크 허가를 받고 녹음을 시작한다. 허가가 없으면 던진다 */
  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mime = pickAudioMime((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = Date.now();
  }
  get seconds(): number { return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0; }
  /** 녹음을 마치고 음성 Blob (type = 매개변수 없는 MIME) */
  stop(): Promise<Blob> {
    return new Promise((res, rej) => {
      const r = this.rec;
      if (!r) { rej(new Error('녹음 중이 아닙니다')); return; }
      const mime = baseMime(r.mimeType || this.mime || 'audio/webm');
      r.onstop = () => { this.release(); res(new Blob(this.chunks, { type: mime })); };
      r.onerror = () => { this.release(); rej(new Error('녹음에 실패했습니다')); };
      if (r.state !== 'inactive') r.stop(); else r.onstop(new Event('stop'));
    });
  }
  /** 버린다 (보내지 않음) */
  cancel() { try { if (this.rec && this.rec.state !== 'inactive') { this.rec.onstop = null; this.rec.stop(); } } catch { /* 무시 */ } this.release(); }
  private release() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.rec = null; }
}
