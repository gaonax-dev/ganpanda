// 접속자 표시(awareness) — 이름·색·커서. 서버는 내용을 해석하지 않고 중계만 한다.
export interface Cursor { x: number; y: number }
export interface PresenceState { name: string; color: string; cursor?: Cursor; /** 계정 id 또는 손님 g:… (톡 멤버 연결, 2026-10-22) */ id?: string }
export interface Peer { name: string; color: string; cursors: Cursor[]; id?: string }

const PALETTE = ['#2f8bff', '#ff6b4a', '#2fbf71', '#b56cff', '#ffb020', '#ff4fa3', '#22c7d6', '#8a9a2f'];

/** 이름으로 정해지는 색 (같은 이름 = 같은 색, 기기와 무관) */
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** awareness 상태들 → 나를 뺀 접속자 목록. 같은 이름(탭 여러 개)은 한 사람으로 합친다 */
export function peersFrom(states: Map<number, Partial<PresenceState>>, myClientId: number): Peer[] {
  const by = new Map<string, Peer>();
  for (const [id, s] of states) {
    if (id === myClientId || s.name === undefined) continue; // 아직 상태를 보내지 않은 접속
    const name = s.name?.trim() || '손님';
    const p = by.get(name) ?? { name, color: s.color ?? colorFor(name), cursors: [], ...(s.id ? { id: s.id } : {}) };
    if (s.cursor) p.cursors.push(s.cursor);
    by.set(name, p);
  }
  return [...by.values()];
}
