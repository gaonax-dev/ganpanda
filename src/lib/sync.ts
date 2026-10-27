// 동기화 서버 연결: y-websocket 으로 프로젝트 문서를 공유하고 접속자 상태(awareness)를 주고받는다.
// 서버 주소가 없으면(운영 빌드에서 VITE_SYNC_URL 미설정) 로컬 모드로 동작한다.
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { roomsWsBase, syncServerUrl } from './core/syncUrl';
import { colorFor, peersFrom, type Cursor, type Peer } from './core/presence';

export type SyncStatus = 'local' | 'connecting' | 'online' | 'offline' | 'paused';

export const SERVER_URL = syncServerUrl(import.meta.env.VITE_SYNC_URL, import.meta.env.DEV);

// ---------- 실시간 방 비용 줄이기 (2026-10-27 사용자: "하루에 1000$는 감당하기 어렵지" → "진행해주고") ----------
// 실시간 방(Durable Object)은 할 일이 없으면 잠들어 과금이 멈춘다. 방을 깨우는 것: 접속자 표시 갱신(15초), 재연결(30초 동안 받은 게 없으면).
/** 연결 유지: 20초마다 'ping' — 서버가 방을 깨우지 않고 'pong' 자동 응답(room.ts setWebSocketAutoResponse) */
export const PING_MS = 20_000;
/** 화면을 안 본 지 이만큼이면 연결을 쉰다 (잠깐 다른 앱 다녀오는 건 그대로) */
export const HIDDEN_PAUSE_MS = 15_000;
/** 손대지 않은 지 이만큼이면 연결을 쉰다 */
export const IDLE_PAUSE_MS = 5 * 60_000;
/** 혼자인 지 이만큼이면 접속자 표시 갱신을 멈춘다 */
export const SOLO_QUIET_MS = 5_000;
/** 'pong' → y-websocket 이 읽을 수 있는 빈 접속자 메시지(종류 1, 길이 1, 0명) — 받은 시각만 갱신되고 아무 일도 없다 */
const NOOP = new Uint8Array([1, 1, 0]);
function timing() {
  const d = { hiddenMs: HIDDEN_PAUSE_MS, idleMs: IDLE_PAUSE_MS };
  if (!import.meta.env.DEV) return d;
  try { return { ...d, ...JSON.parse(localStorage.getItem('ganpanda.test.syncTiming') || '{}') }; } catch { return d; } // 테스트용
}
/** ping 을 보내고 pong 을 빈 메시지로 바꿔 주는 WebSocket */
class PingSocket extends WebSocket {
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.addEventListener('open', () => { this.timer = setInterval(() => { if (this.readyState === WebSocket.OPEN) this.send('ping'); }, PING_MS); });
    this.addEventListener('close', () => clearInterval(this.timer));
  }
  set onmessage(f: ((ev: MessageEvent) => void) | null) {
    super.onmessage = f ? (ev: MessageEvent) => f(ev.data === 'pong' ? new MessageEvent('message', { data: NOOP.buffer.slice(0) }) : ev) : null;
  }
  get onmessage() { return super.onmessage; }
}

export class SyncClient {
  private provider: WebsocketProvider | null = null;
  private onOnline: (() => void)[] = [];
  private onSynced: (() => void)[] = [];
  private syncedOnce = false;
  /** 서버와 첫 동기화가 끝나면 (이미 끝났으면 바로) */
  whenSynced(f: () => void) { if (this.syncedOnce) f(); else this.onSynced.push(f); }

  /** params: 자격 (?session= 또는 ?invite=) — 서버가 역할을 정한다 */
  constructor(room: string, doc: Y.Doc, onStatus: (s: SyncStatus) => void, onPeers: (p: Peer[]) => void, params: Record<string, string> = {}) {
    if (!SERVER_URL) { onStatus('local'); return; }
    onStatus('connecting');
    const p = new WebsocketProvider(roomsWsBase(SERVER_URL), room, doc, { params, WebSocketPolyfill: PingSocket as unknown as typeof WebSocket });
    p.on('status', ({ status }: { status: string }) => {
      onStatus(status === 'connected' ? 'online' : status === 'connecting' ? 'connecting' : this.paused ? 'paused' : 'offline');
      if (status === 'connected') this.onOnline.forEach((f) => f());
    });
    // 서버와 첫 동기화가 끝남 (2026-10-25 보드 로딩): 그 전엔 문서가 비어 보여 "사진 없음"이 먼저 떴다
    p.on('sync', (isSynced: boolean) => { if (isSynced && !this.syncedOnce) { this.syncedOnce = true; this.onSynced.forEach((f) => f()); } });
    p.awareness.on('change', () => { onPeers(peersFrom(p.awareness.getStates(), p.awareness.clientID)); this.soloCheck(); });
    this.provider = p;
    this.onStatus = onStatus;
    // 나감 알리기 (2026-10-15 사용자: "사용자가 나가도 표시가 계속 남는다"): 브라우저는 탭을 숨기거나 닫을 때 소켓을 바로 닫지 않는 일이 많다
    // (특히 휴대폰). 숨기면 내 표시를 지우고(돌아오면 복원), 페이지를 떠나면(pagehide) 표시를 지우고 연결을 끊는다. 다시 보이면(뒤로가기 복원) 다시 연결
    if (typeof document !== 'undefined') {
      const t = timing();
      // 화면을 안 보면 잠시 뒤 연결을 쉬고, 다시 보면 바로 이어 붙인다
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { this.away(); clearTimeout(this.hiddenTimer); this.hiddenTimer = setTimeout(() => this.pause(), t.hiddenMs); }
        else { clearTimeout(this.hiddenTimer); this.resume(); this.back(); }
      });
      // 오래 손대지 않으면 쉬고, 손대면 이어 붙인다
      const touch = () => { this.lastActive = Date.now(); if (this.paused && document.visibilityState !== 'hidden') this.resume(); };
      for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touch, { capture: true, passive: true });
      this.idleTimer = setInterval(() => { if (!this.paused && Date.now() - this.lastActive >= t.idleMs) this.pause(); }, Math.min(30_000, Math.max(500, t.idleMs / 4)));
      window.addEventListener('pagehide', () => { this.away(); p.disconnect(); });
      window.addEventListener('pageshow', (e) => { if (e.persisted) { p.connect(); this.back(); } });
    }
  }

  private onStatus: (s: SyncStatus) => void = () => {};
  private paused = false;
  private lastActive = Date.now();
  private hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setInterval> | undefined;
  private soloTimer: ReturnType<typeof setTimeout> | undefined;
  /** 연결 쉬기 (편집은 기기에 남고, 이어 붙이면 올라간다) */
  private pause() {
    if (this.paused || !this.provider) return;
    this.paused = true;
    this.provider.disconnect();
    this.onStatus('paused');
  }
  private resume() {
    if (!this.paused || !this.provider) return;
    this.paused = false;
    this.lastActive = Date.now();
    this.provider.connect();
    this.back(); // 다시 알린다 — 혼자라 표시를 거둔 채 쉬었다면, 그새 들어와 조용해진 사람과 서로 못 보게 된다 (혼자면 잠시 뒤 다시 거둔다)
  }
  /** 혼자면(잠시 뒤에도) 내 표시를 거둬 15초 갱신을 멈춘다. 누가 들어오면(그쪽이 먼저 알린다) 다시 표시 */
  private soloCheck() {
    const aw = this.provider?.awareness;
    if (!aw) return;
    const others = [...aw.getStates().keys()].filter((id) => id !== aw.clientID).length;
    clearTimeout(this.soloTimer);
    if (others) { this.back(); return; }
    if (aw.getLocalState() !== null) this.soloTimer = setTimeout(() => {
      if ([...aw.getStates().keys()].every((id) => id === aw.clientID)) aw.setLocalState(null);
    }, SOLO_QUIET_MS);
  }

  /** 다시 연결될 때마다 실행 (미전송 에셋 업로드 등) */
  whenOnline(f: () => void) {
    this.onOnline.push(f);
  }

  private name: string | null = null;
  private myId = '';
  setName(name: string, id = this.myId) {
    this.name = name;
    this.myId = id;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // 숨겨진 동안은 표시하지 않는다
    this.provider?.awareness.setLocalState({ name, color: colorFor(name), cursor: this.provider.awareness.getLocalState()?.cursor, ...(id ? { id } : {}) });
  }
  /** 내 표시 지우기 (상대 화면에서 바로 사라짐) */
  private away() { this.provider?.awareness.setLocalState(null); }
  /** 다시 표시 (숨겨진 동안은 하지 않는다) */
  private back() { if (this.name !== null && this.provider?.awareness.getLocalState() === null && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) this.setName(this.name); }

  setCursor(cursor: Cursor | null) {
    const aw = this.provider?.awareness;
    if (!aw || aw.getLocalState()?.name === undefined) return;
    aw.setLocalStateField('cursor', cursor ?? undefined);
  }

  destroy() {
    clearInterval(this.idleTimer); clearTimeout(this.hiddenTimer); clearTimeout(this.soloTimer);
    this.provider?.destroy();
  }
}
