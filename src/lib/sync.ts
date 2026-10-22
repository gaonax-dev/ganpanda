// 동기화 서버 연결: y-websocket 으로 프로젝트 문서를 공유하고 접속자 상태(awareness)를 주고받는다.
// 서버 주소가 없으면(운영 빌드에서 VITE_SYNC_URL 미설정) 로컬 모드로 동작한다.
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';
import { roomsWsBase, syncServerUrl } from './core/syncUrl';
import { colorFor, peersFrom, type Cursor, type Peer } from './core/presence';

export type SyncStatus = 'local' | 'connecting' | 'online' | 'offline';

export const SERVER_URL = syncServerUrl(import.meta.env.VITE_SYNC_URL, import.meta.env.DEV);

export class SyncClient {
  private provider: WebsocketProvider | null = null;
  private onOnline: (() => void)[] = [];

  /** params: 자격 (?session= 또는 ?invite=) — 서버가 역할을 정한다 */
  constructor(room: string, doc: Y.Doc, onStatus: (s: SyncStatus) => void, onPeers: (p: Peer[]) => void, params: Record<string, string> = {}) {
    if (!SERVER_URL) { onStatus('local'); return; }
    onStatus('connecting');
    const p = new WebsocketProvider(roomsWsBase(SERVER_URL), room, doc, { params });
    p.on('status', ({ status }: { status: string }) => {
      onStatus(status === 'connected' ? 'online' : status === 'connecting' ? 'connecting' : 'offline');
      if (status === 'connected') this.onOnline.forEach((f) => f());
    });
    p.awareness.on('change', () => onPeers(peersFrom(p.awareness.getStates(), p.awareness.clientID)));
    this.provider = p;
    // 나감 알리기 (2026-10-15 사용자: "사용자가 나가도 표시가 계속 남는다"): 브라우저는 탭을 숨기거나 닫을 때 소켓을 바로 닫지 않는 일이 많다
    // (특히 휴대폰). 숨기면 내 표시를 지우고(돌아오면 복원), 페이지를 떠나면(pagehide) 표시를 지우고 연결을 끊는다. 다시 보이면(뒤로가기 복원) 다시 연결
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? this.away() : this.back()));
      window.addEventListener('pagehide', () => { this.away(); p.disconnect(); });
      window.addEventListener('pageshow', (e) => { if (e.persisted) { p.connect(); this.back(); } });
    }
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
  /** 다시 표시 */
  private back() { if (this.name !== null && this.provider?.awareness.getLocalState() === null) this.setName(this.name); }

  setCursor(cursor: Cursor | null) {
    const aw = this.provider?.awareness;
    if (!aw || aw.getLocalState()?.name === undefined) return;
    aw.setLocalStateField('cursor', cursor ?? undefined);
  }

  destroy() {
    this.provider?.destroy();
  }
}
