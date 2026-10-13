// 방(프로젝트) 하나 = Durable Object 하나.
// Yjs 문서를 SQLite 에 업데이트 로그로 저장하고, WebSocket(Hibernation)으로 접속자 간 중계한다.
import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { MSG_AWARENESS, MSG_QUERY_AWARENESS, MSG_SYNC, awarenessRemoval } from './protocol';

/** 업데이트 로그가 이만큼 쌓이면 스냅샷 하나로 압축 */
const COMPACT_AT = 200;
/** WebSocket attachment 최대 2KB → 접속자 상태는 이보다 작을 때만 보관 */
const MAX_AWARENESS = 1800;
const LOAD = Symbol('load');

interface Attachment { aw?: Uint8Array }

export class Room extends DurableObject<Env> {
  private doc = new Y.Doc({ gc: true });
  private rows = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)');
      const rows = sql.exec<{ data: ArrayBuffer }>('SELECT data FROM updates ORDER BY id').toArray();
      Y.transact(this.doc, () => {
        for (const r of rows) Y.applyUpdate(this.doc, new Uint8Array(r.data), LOAD);
      }, LOAD);
      this.rows = rows.length;
    });
    this.doc.on('update', (u: Uint8Array, origin: unknown) => this.onUpdate(u, origin));
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    // 서버 상태 벡터를 먼저 보내 클라이언트가 가진(서버에 없는) 변경을 받는다
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    sync.writeSyncStep1(enc, this.doc);
    server.send(encoding.toUint8Array(enc));
    this.sendAwarenessOfOthers(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string') return;
    const data = new Uint8Array(message);
    const dec = decoding.createDecoder(data);
    switch (decoding.readVarUint(dec)) {
      case MSG_SYNC: {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        sync.readSyncMessage(dec, enc, this.doc, ws);
        if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
        break;
      }
      case MSG_AWARENESS:
        if (data.byteLength <= MAX_AWARENESS) ws.serializeAttachment({ aw: data } satisfies Attachment);
        this.broadcast(data, ws);
        break;
      case MSG_QUERY_AWARENESS:
        this.sendAwarenessOfOthers(ws);
        break;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.leave(ws);
    try { ws.close(code, reason); } catch { /* 이미 닫힘 */ }
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  /** 문서 변경: 저장 먼저, 그다음 다른 접속자에게 전달 */
  private onUpdate(update: Uint8Array, origin: unknown) {
    if (origin === LOAD) return;
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT INTO updates (data) VALUES (?)', update);
    if (++this.rows > COMPACT_AT) {
      // 같은 동기 블록 안의 쓰기는 원자적으로 반영된다
      sql.exec('DELETE FROM updates');
      sql.exec('INSERT INTO updates (data) VALUES (?)', Y.encodeStateAsUpdate(this.doc));
      this.rows = 1;
    }
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    sync.writeUpdate(enc, update);
    this.broadcast(encoding.toUint8Array(enc), origin);
  }

  private leave(ws: WebSocket) {
    const aw = (ws.deserializeAttachment() as Attachment | null)?.aw;
    const removal = aw && awarenessRemoval(new Uint8Array(aw));
    if (removal) this.broadcast(removal, ws);
  }

  private sendAwarenessOfOthers(to: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === to) continue;
      const aw = (ws.deserializeAttachment() as Attachment | null)?.aw;
      if (aw) to.send(aw);
    }
  }

  private broadcast(data: Uint8Array, except?: unknown) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* 끊긴 소켓 */ }
    }
  }
}
