// 메인 화면 톡 목록의 상태 — 헤더 [톡] 단추(새 대화 수)와 목록 창(HomeTalks.svelte)이 같이 쓴다
// (2026-10-25 사용자: "메인화면에 톡을 헤더로 이동시키고 누르면 톡 목록으로")
import { app } from '../state.svelte';
import { listMyTalks, type TalkSummary } from '../projects';

class HomeTalksState {
  talks = $state<TalkSummary[]>([]);
  /** 목록 창 열림 (헤더 [톡]) */
  open = $state(false);
  loaded = $state(false);
  /** 읽음 표시가 바뀌면 올린다 (localStorage 는 반응형이 아니라서) */
  seenTick = $state(0);

  async load() {
    try { this.talks = await listMyTalks(); } catch { this.talks = []; }
    this.loaded = true;
  }
  reset() { this.talks = []; this.loaded = false; this.open = false; }

  private seenKey = (t: TalkSummary) => `ganpanda.seen.${t.projectId}`;
  seenOf(t: TalkSummary): number {
    try { return (JSON.parse(localStorage.getItem(this.seenKey(t)) ?? '{}') as Record<string, number>)[`talk:${t.roomId}`] ?? 0; } catch { return 0; }
  }
  markSeen(t: TalkSummary, ts: number) {
    try { const m = JSON.parse(localStorage.getItem(this.seenKey(t)) ?? '{}') as Record<string, number>; if ((m[`talk:${t.roomId}`] ?? 0) < ts) { m[`talk:${t.roomId}`] = ts; localStorage.setItem(this.seenKey(t), JSON.stringify(m)); } } catch { /* 저장 불가 */ }
    this.seenTick++;
  }
  isNew(t: TalkSummary): boolean { return (void this.seenTick, !!t.last && t.last.author !== app.nickname && t.last.ts > this.seenOf(t)); }
  /** 헤더 단추의 수: 새 대화가 있는 방 */
  get newCount(): number { return this.talks.filter((t) => this.isNew(t)).length; }
}
export const homeTalks = new HomeTalksState();
