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

  constructor(room: string, doc: Y.Doc, onStatus: (s: SyncStatus) => void, onPeers: (p: Peer[]) => void) {
    if (!SERVER_URL) { onStatus('local'); return; }
    onStatus('connecting');
    const p = new WebsocketProvider(roomsWsBase(SERVER_URL), room, doc);
    p.on('status', ({ status }: { status: string }) => {
      onStatus(status === 'connected' ? 'online' : status === 'connecting' ? 'connecting' : 'offline');
      if (status === 'connected') this.onOnline.forEach((f) => f());
    });
    p.awareness.on('change', () => onPeers(peersFrom(p.awareness.getStates(), p.awareness.clientID)));
    this.provider = p;
  }

  /** 다시 연결될 때마다 실행 (미전송 에셋 업로드 등) */
  whenOnline(f: () => void) {
    this.onOnline.push(f);
  }

  setName(name: string) {
    this.provider?.awareness.setLocalState({ name, color: colorFor(name), cursor: this.provider.awareness.getLocalState()?.cursor });
  }

  setCursor(cursor: Cursor | null) {
    const aw = this.provider?.awareness;
    if (!aw || aw.getLocalState()?.name === undefined) return;
    aw.setLocalStateField('cursor', cursor ?? undefined);
  }

  destroy() {
    this.provider?.destroy();
  }
}
