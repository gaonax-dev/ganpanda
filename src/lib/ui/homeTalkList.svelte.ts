// 메인 화면 톡 목록의 상태 — 헤더 [톡] 단추(새 대화 수)와 목록 창(HomeTalks.svelte)이 같이 쓴다
// (2026-10-25 사용자: "메인화면에 톡을 헤더로 이동시키고 누르면 톡 목록으로")
import { app } from '../state.svelte';
import { listMyPeople, listMyTalks, type Person, type TalkSummary } from '../projects';

class HomeTalksState {
  talks = $state<TalkSummary[]>([]);
  /** 목록 창 열림 (헤더 [톡]) */
  open = $state(false);
  loaded = $state(false);
  /** 읽음 표시가 바뀌면 올린다 (localStorage 는 반응형이 아니라서) */
  seenTick = $state(0);

  /** 하단 탭 [사용자 | 톡] (2026-10-26 "톡 하단에 사용자, 톡으로 탭바") */
  tab = $state<'people' | 'talks'>('talks');
  people = $state<Person[]>([]);
  peopleLoaded = $state(false);
  /** [사용자]에서 고른 사람 — 톡 탭에 그 사람이 있는 방만 */
  person = $state<Person | null>(null);

  async load() {
    try { this.talks = await listMyTalks(); } catch { this.talks = []; }
    this.loaded = true;
  }
  async loadPeople() {
    try { this.people = await listMyPeople(); } catch { this.people = []; }
    this.peopleLoaded = true;
  }
  reset() { this.talks = []; this.loaded = false; this.open = false; this.people = []; this.peopleLoaded = false; this.person = null; this.tab = 'talks'; }
  /** 톡 탭에 보이는 방 */
  get shown(): TalkSummary[] { const p = this.person; return p ? this.talks.filter((t) => t.memberIds?.includes(p.id)) : this.talks; }

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
