// 테스트용 최소 y-websocket 호환 클라이언트
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { exports } from 'cloudflare:workers';

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;

export class TestClient {
  doc = new Y.Doc();
  awareness = new awarenessProtocol.Awareness(this.doc);
  ws!: WebSocket;
  received = 0;
  /** y-websocket 처럼 다른 사람의 상태를 받으면 서버에 그대로 되돌려 보낸다 */
  echo = false;

  static async connect(room: string, doc?: Y.Doc) {
    const c = new TestClient();
    if (doc) c.doc = doc;
    c.awareness = new awarenessProtocol.Awareness(c.doc);
    const res = await exports.default.fetch(`http://sync/api/rooms/${room}/ws`, { headers: { Upgrade: 'websocket' } });
    if (res.status !== 101 || !res.webSocket) throw new Error(`upgrade failed: ${res.status}`);
    c.ws = res.webSocket;
    c.ws.accept();
    // 수신 순서를 지키며 처리 (런타임에 따라 Blob 으로 들어옴)
    let chain = Promise.resolve();
    c.ws.addEventListener('message', (e) => {
      chain = chain.then(async () => {
        const d = e.data as ArrayBuffer | Blob;
        c.onMessage(new Uint8Array(d instanceof Blob ? await d.arrayBuffer() : d));
      });
    });
    // 로컬 변경 → 서버
    c.doc.on('update', (u: Uint8Array, origin: unknown) => {
      if (origin === c) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      sync.writeUpdate(enc, u);
      c.ws.send(encoding.toUint8Array(enc));
    });
    // sync step 1
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    sync.writeSyncStep1(enc, c.doc);
    c.ws.send(encoding.toUint8Array(enc));
    return c;
  }

  private onMessage(data: Uint8Array) {
    this.received++;
    const dec = decoding.createDecoder(data);
    const type = decoding.readVarUint(dec);
    if (type === MSG_SYNC) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      sync.readSyncMessage(dec, enc, this.doc, this);
      if (encoding.length(enc) > 1) this.ws.send(encoding.toUint8Array(enc));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), this);
      if (this.echo) this.ws.send(data);
    }
  }

  setPresence(state: Record<string, unknown>) {
    this.awareness.setLocalState(state);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
    this.ws.send(encoding.toUint8Array(enc));
  }

  close() {
    this.ws.close(1000, 'bye');
  }
}

/** 조건이 참이 될 때까지 대기 (WebSocket 메시지 처리용) */
export async function until(cond: () => boolean, ms = 2000) {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
