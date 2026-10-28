// 진단 기록 (2026-10-29 사용자: "줌인아웃을 반복하면 다운된다" — 에뮬레이터로 재현이 안 돼 아이폰에서 직접 본다).
// 아이폰은 웹 화면이 메모리를 넘기면 페이지를 다시 연다 — 그때는 pagehide 가 오지 않는다. 그래서 돌아가는 동안 1초마다 지금 상태와
// 최근 사건을 기기(localStorage)에 써 두고(정상 종료·화면 숨김이면 "깨끗"), 다음에 열 때 깨끗하지 않은 기록이 방금 것이면 보여 준다.

/** 마지막 기록과 다시 열림 사이가 이보다 길면 비정상 종료로 보지 않는다 (앱을 쓸어 닫고 나중에 연 것 등) */
export const CRASH_GAP_MS = 60_000;
const EVENTS_MAX = 30;
const LIVE = 'ganpanda.crash.live';
const LAST = 'ganpanda.crash.last';

export interface CrashEvent { t: number; msg: string }
export interface CrashRecord { t: number; clean: boolean; state: Record<string, unknown>; events: CrashEvent[] }
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class CrashLog {
  private state: Record<string, unknown> = {};
  private events: CrashEvent[] = [];
  private prev: CrashRecord | null = null;
  /** flush 할 때 덧붙일 값 (화면의 그림 수 등) */
  probe: () => Record<string, unknown> = () => ({});

  constructor(private store: Store, private now: () => number) {
    try {
      const live = JSON.parse(store.getItem(LIVE) ?? 'null') as CrashRecord | null;
      store.removeItem(LIVE);
      if (live && !live.clean && now() - live.t <= CRASH_GAP_MS) store.setItem(LAST, JSON.stringify(live));
      this.prev = JSON.parse(store.getItem(LAST) ?? 'null');
    } catch { this.prev = null; }
  }
  /** 직전 비정상 종료 기록 (닫기 전까지) */
  previous(): CrashRecord | null { return this.prev; }
  dismiss() { this.prev = null; try { this.store.removeItem(LAST); } catch { /* 저장 못 함 */ } }
  set(key: string, value: unknown) { this.state[key] = value; }
  event(msg: string) {
    this.events.push({ t: this.now(), msg });
    if (this.events.length > EVENTS_MAX) this.events.splice(0, this.events.length - EVENTS_MAX);
  }
  private write(clean: boolean) {
    let extra: Record<string, unknown> = {};
    try { extra = this.probe(); } catch { /* 확인용 */ }
    const rec: CrashRecord = { t: this.now(), clean, state: { ...this.state, ...extra }, events: this.events };
    try { this.store.setItem(LIVE, JSON.stringify(rec)); } catch { /* 저장 못 함 */ }
  }
  flush() { this.write(false); }
  /** 정상 종료·화면 숨김 — 이 뒤에 죽어도 비정상 종료로 보지 않는다 */
  clean() { this.write(true); }
}

function storage(): Store {
  try { const s = window.localStorage; s.getItem(LIVE); return s; }
  catch { return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }; }
}

export const crashLog: CrashLog = typeof window === 'undefined' ? new CrashLog({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }, Date.now) : new CrashLog(storage(), Date.now);

if (typeof window !== 'undefined') {
  crashLog.probe = () => ({
    url: location.pathname,
    imgs: document.querySelectorAll('img').length,
    photoFull: document.querySelectorAll('[data-testid="photo-full"], [data-testid="photo-overlay-full"]').length,
    baked: document.querySelectorAll('.baked').length,
    flat: document.querySelectorAll('[data-testid="flat-overlay"]').length,
    canvases: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`).join(' '),
    nodes: document.getElementsByTagName('*').length,
    dpr: devicePixelRatio,
    screen: `${innerWidth}x${innerHeight}`,
  });
  crashLog.event('열림');
  setInterval(() => { if (document.visibilityState !== 'hidden') crashLog.flush(); }, 1000);
  window.addEventListener('pagehide', () => crashLog.clean());
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? crashLog.clean() : crashLog.flush()));
}
