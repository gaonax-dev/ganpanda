// 방(프로젝트) 하나 = Durable Object 하나.
// Yjs 문서를 SQLite 에 업데이트 로그로 저장하고, WebSocket(Hibernation)으로 접속자 간 중계한다.
import { DurableObject } from 'cloudflare:workers';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import {
  MSG_AWARENESS, MSG_QUERY_AWARENESS, MSG_SYNC, encodeAwareness, parseAwareness, removalOf, type AwarenessEntry,
} from './protocol';

/** 업데이트 로그가 이만큼 쌓이면 스냅샷 하나로 압축 */
const COMPACT_AT = 200;
/** 접속자 상태(JSON) 최대 길이 — 커서·이름 정도만 담는다 */
const MAX_STATE = 4096;
const LOAD = Symbol('load');

interface Attachment { sid: string }
interface AwRow { client_id: number; sock: string; clock: number; state: string }

export class Room extends DurableObject<Env> {
  private doc = new Y.Doc({ gc: true });
  private rows = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)');
      // 접속자 상태의 주인(소켓) 기록 — y-websocket 은 남의 상태도 되돌려 보내므로 "처음 보낸 소켓 = 주인"으로 추적
      sql.exec('CREATE TABLE IF NOT EXISTS awareness (client_id INTEGER PRIMARY KEY, sock TEXT NOT NULL, clock INTEGER NOT NULL, state TEXT NOT NULL)');
      const rows = sql.exec<{ data: ArrayBuffer }>('SELECT data FROM updates ORDER BY id').toArray();
      Y.transact(this.doc, () => {
        for (const r of rows) Y.applyUpdate(this.doc, new Uint8Array(r.data), LOAD);
      }, LOAD);
      this.rows = rows.length;
      this.dropDeadAwareness();
    });
    this.doc.on('update', (u: Uint8Array, origin: unknown) => this.onUpdate(u, origin));
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    const sid = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [sid]);
    server.serializeAttachment({ sid } satisfies Attachment);
    // 서버 상태 벡터를 먼저 보내 클라이언트가 가진(서버에 없는) 변경을 받는다
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    sync.writeSyncStep1(enc, this.doc);
    server.send(encoding.toUint8Array(enc));
    this.sendAwarenessOfOthers(server, sid);
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
      case MSG_AWARENESS: {
        const accepted = this.applyAwareness(this.sidOf(ws), parseAwareness(data) ?? []);
        if (accepted.length) this.broadcast(encodeAwareness(accepted), ws);
        break;
      }
      case MSG_QUERY_AWARENESS:
        this.sendAwarenessOfOthers(ws, this.sidOf(ws));
        break;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.leave(this.sidOf(ws), ws);
    try { ws.close(code, reason); } catch { /* 이미 닫힘 */ }
  }

  async webSocketError(ws: WebSocket) {
    this.leave(this.sidOf(ws), ws);
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

  // ---------- 접속자 상태 (awareness) ----------

  private sidOf(ws: WebSocket): string {
    return (ws.deserializeAttachment() as Attachment).sid;
  }

  private isLive(sock: string): boolean {
    return this.ctx.getWebSockets(sock).length > 0;
  }

  /**
   * 소켓 sid 가 보낸 항목 중 "자기 것"만 받아들인다.
   * 주인이 없거나 주인 소켓이 죽었으면 sid 가 주인이 되고, 다른 살아 있는 소켓의 것은 echo 이므로 무시한다.
   */
  private applyAwareness(sid: string, entries: AwarenessEntry[]): AwarenessEntry[] {
    const sql = this.ctx.storage.sql;
    const accepted: AwarenessEntry[] = [];
    for (const e of entries) {
      if (e.state.length > MAX_STATE) continue;
      const row = sql.exec<AwRow>('SELECT * FROM awareness WHERE client_id = ?', e.clientId).toArray()[0];
      const mine = !row || row.sock === sid || !this.isLive(row.sock);
      if (!mine) continue;
      if (row && row.sock === sid && e.clock < row.clock) continue; // 오래된 항목
      if (e.state === 'null') {
        if (row) sql.exec('DELETE FROM awareness WHERE client_id = ?', e.clientId);
      } else {
        sql.exec(
          'INSERT INTO awareness (client_id, sock, clock, state) VALUES (?, ?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET sock = excluded.sock, clock = excluded.clock, state = excluded.state',
          e.clientId, sid, e.clock, e.state,
        );
      }
      accepted.push(e);
    }
    return accepted;
  }

  private leave(sid: string, ws: WebSocket) {
    const sql = this.ctx.storage.sql;
    const rows = sql.exec<AwRow>('SELECT * FROM awareness WHERE sock = ?', sid).toArray();
    if (!rows.length) return;
    sql.exec('DELETE FROM awareness WHERE sock = ?', sid);
    this.broadcast(encodeAwareness(rows.map((r) => removalOf({ clientId: r.client_id, clock: r.clock }))), ws);
  }

  /** 잠들었다 깨어났을 때: 이미 죽은 소켓의 상태를 정리하고 남은 접속자에게 알린다 */
  private dropDeadAwareness() {
    const sql = this.ctx.storage.sql;
    const dead = sql.exec<AwRow>('SELECT * FROM awareness').toArray().filter((r) => !this.isLive(r.sock));
    if (!dead.length) return;
    for (const r of dead) sql.exec('DELETE FROM awareness WHERE client_id = ?', r.client_id);
    this.broadcast(encodeAwareness(dead.map((r) => removalOf({ clientId: r.client_id, clock: r.clock }))));
  }

  private sendAwarenessOfOthers(to: WebSocket, sid: string) {
    const rows = this.ctx.storage.sql.exec<AwRow>('SELECT * FROM awareness WHERE sock != ?', sid).toArray().filter((r) => this.isLive(r.sock));
    if (rows.length) to.send(encodeAwareness(rows.map((r) => ({ clientId: r.client_id, clock: r.clock, state: r.state }))));
  }

  private broadcast(data: Uint8Array, except?: unknown) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(data); } catch { /* 끊긴 소켓 */ }
    }
  }
}
