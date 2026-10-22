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

type Role = 'owner' | 'editor' | 'viewer';
/** 좌석 갱신 간격 (Account.SEAT_TTL 보다 충분히 짧게) */
const SEAT_RENEW = 30_000;
/** 소켓에 붙여 두는 정보 (Hibernation 뒤에도 유지) */
interface SocketAttachment { sid: string; role: Role; owner: string; renewedAt: number }
export interface Attachment { assetId: string; name: string; type: string; size: number }
export interface Message { id: string; objectId: string; author: string; text: string; kind: 'chat' | 'comment' | 'approval' | 'voice'; ts: number; attachments?: Attachment[]; refs?: { kind: 'object' | 'photo' | 'pin'; id: string; label: string }[]; /** 보낸 사람 아이디 (계정 id 또는 손님 g:…, 2026-10-22) */ authorId?: string }
/** 제안 승인 (앱의 core/proposal.ts Approval 과 같은 구조). snapshot 은 앱이 만든 JSON 그대로 */
export interface Approval { id: string; at: number; by: string; hash: string; snapshot: unknown; proposalId?: string; /** 진행 동의에서 뺀 사인물 (2026-10-22) */ excluded?: string[] }
type AwRow = { client_id: number; sock: string; clock: number; state: string; updated_at?: number };
/** y-protocols 와 같은 기준: 클라이언트는 15초마다 갱신하므로 30초 넘게 조용한 상태는 죽은 것 (닫힘 신호 없이 사라진 휴대폰 탭 등) */
const AWARENESS_TTL = 30_000;

export class Room extends DurableObject<Env> {
  private doc = new Y.Doc({ gc: true });
  private rows = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)');
      // 백업용 (2026-10-21): changed = 마지막 변경 시각, backed = 마지막으로 백업한 변경 시각
      sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
      // 접속자 상태의 주인(소켓) 기록 — y-websocket 은 남의 상태도 되돌려 보내므로 "처음 보낸 소켓 = 주인"으로 추적
      sql.exec('CREATE TABLE IF NOT EXISTS awareness (client_id INTEGER PRIMARY KEY, sock TEXT NOT NULL, clock INTEGER NOT NULL, state TEXT NOT NULL)');
      try { sql.exec('ALTER TABLE awareness ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0'); } catch { /* 이미 있음 */ }
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
    // Worker 가 권한·좌석 검사 후 넣는다
    const sid = req.headers.get('x-sid') ?? crypto.randomUUID();
    const role = (req.headers.get('x-role') ?? 'viewer') as Role;
    const owner = req.headers.get('x-owner') ?? '';
    this.ctx.acceptWebSocket(server, [sid]);
    server.serializeAttachment({ sid, role, owner, renewedAt: Date.now() } satisfies SocketAttachment);
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
    this.renewSeat(ws);
    const data = new Uint8Array(message);
    const dec = decoding.createDecoder(data);
    switch (decoding.readVarUint(dec)) {
      case MSG_SYNC: {
        // viewer 는 동기화 요청(step1)만 — 문서 변경(step2·update)은 버린다
        if (this.roleOf(ws) === 'viewer' && decoding.peekVarUint(dec) !== sync.messageYjsSyncStep1) break;
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
    this.releaseSeat(ws);
    try { ws.close(code, reason); } catch { /* 이미 닫힘 */ }
  }

  async webSocketError(ws: WebSocket) {
    this.leave(this.sidOf(ws), ws);
    this.releaseSeat(ws);
  }

  // ---------- 동시접속 좌석 (Account DO) ----------

  private renewSeat(ws: WebSocket) {
    const a = ws.deserializeAttachment() as SocketAttachment;
    if (!a.owner || Date.now() - a.renewedAt < SEAT_RENEW) return;
    ws.serializeAttachment({ ...a, renewedAt: Date.now() } satisfies SocketAttachment);
    this.ctx.waitUntil(this.env.ACCOUNT.getByName(a.owner).renew(a.sid));
  }

  private releaseSeat(ws: WebSocket) {
    const a = ws.deserializeAttachment() as SocketAttachment;
    if (a.owner) this.ctx.waitUntil(this.env.ACCOUNT.getByName(a.owner).release(a.sid));
  }

  private meta(key: string): number | null {
    const r = this.ctx.storage.sql.exec<{ value: number }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0];
    return r ? Number(r.value) : null;
  }
  private setMeta(key: string, value: number) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  /** 백업할 상태 (2026-10-21): 마지막 백업 뒤 바뀌었으면 Yjs 전체 상태, 아니면 null. 빈 문서는 백업하지 않는다.
   *  변경 기록이 없는 옛 방(이 기능 전에 만든 것)은 바뀐 것으로 본다 */
  async backupState(): Promise<{ data: Uint8Array; changedAt: number } | null> {
    if (!this.rows) return null;
    const changedAt = this.meta('changed') ?? 1;
    const backed = this.meta('backed') ?? 0;
    return changedAt > backed ? { data: Y.encodeStateAsUpdate(this.doc), changedAt } : null;
  }
  async markBackedUp(changedAt: number) { this.setMeta('backed', changedAt); }

  /** 지금 문서 전체 (Yjs 상태) — 복원 확인·버전 저장용 */
  async exportState(): Promise<Uint8Array> { return Y.encodeStateAsUpdate(this.doc); }

  /**
   * 다른 방의 문서에서 고른 map 만 복제 (2026-10-22 요청 = 보드 복제, 간판집 [그대로·사진만]). settings 는 keepSettings 키만 —
   * 단가표·원가·견적 줄·주문 정보는 절대 안 옮긴다(외주 요청은 다른 간판집이 읽는다).
   * 대화(messages)는 안 가져온다. 들어온 값 안의 assetId 들을 돌려준다 — 새 소유 계정에 에셋 등록용
   */
  async cloneFrom(update: Uint8Array, maps: string[], keepSettings: string[] = []): Promise<{ assets: string[]; photoAssets: string[] }> {
    const old = new Y.Doc();
    Y.applyUpdate(old, update);
    const assets = new Set<string>(), photoAssets: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'assetId' && typeof x === 'string') assets.add(x); else walk(x); }
    };
    const clone = (v: unknown): unknown => {
      if (v instanceof Y.Map) { const m = new Y.Map<unknown>(); for (const [k, x] of v.entries()) m.set(k, clone(x)); return m; }
      if (v instanceof Y.Array || v instanceof Y.Text) return v.toJSON();
      return v === undefined ? v : JSON.parse(JSON.stringify(v));
    };
    this.doc.transact(() => {
      for (const name of maps) {
        const src = old.getMap<unknown>(name), cur = this.doc.getMap<unknown>(name);
        for (const [k, v] of src.entries()) {
          if (name === 'settings' && !keepSettings.includes(k)) continue;
          cur.set(k, clone(v));
          const j = v instanceof Y.Map ? v.toJSON() : v;
          walk(j);
          if (name === 'photos' && j && typeof j === 'object' && typeof (j as { assetId?: unknown }).assetId === 'string') photoAssets.push((j as { assetId: string }).assetId);
        }
      }
    });
    return { assets: [...assets], photoAssets };
  }

  /** 방을 비운다 — 계정 삭제 (2026-10-22): 접속을 끊고 저장된 변경을 모두 지운다 */
  async wipe() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'deleted'); } catch { /* 이미 닫힘 */ } }
    await this.ctx.storage.deleteAll();
    this.doc.destroy();
    this.doc = new Y.Doc({ gc: true });
    this.doc.on('update', (u: Uint8Array, origin: unknown) => this.onUpdate(u, origin));
    this.rows = 0;
  }

  /** 백업을 그대로 합친다(merge) — 잃어버린·빈 방, 새 프로젝트로 꺼내기 (2026-10-21) */
  async seedFrom(update: Uint8Array) { Y.applyUpdate(this.doc, update); }

  /**
   * 되돌리기 (2026-10-21): 사진·사인물·말풍선·디자인 소스·설정을 백업 내용으로 바꾼다. 대화(messages)는 그대로 둔다.
   * Yjs 는 옛 상태를 합치기만 하면 새 내용이 남으므로, 지금 문서에서 키를 지우고 백업 값을 새로 넣는 변경을 만든다 → 접속자에게도 그대로 전달.
   * 설정 restored = 누가·언제·어느 버전으로 (앱이 안내)
   */
  async revertTo(update: Uint8Array, by: string, version: string) {
    const old = new Y.Doc();
    Y.applyUpdate(old, update);
    const clone = (v: unknown): unknown => {
      if (v instanceof Y.Map) { const m = new Y.Map<unknown>(); for (const [k, x] of v.entries()) m.set(k, clone(x)); return m; }
      if (v instanceof Y.Array || v instanceof Y.Text) return v.toJSON();
      return v === undefined ? v : JSON.parse(JSON.stringify(v));
    };
    this.doc.transact(() => {
      for (const name of ['photos', 'objects', 'pins', 'sources', 'settings']) {
        const cur = this.doc.getMap<unknown>(name), src = old.getMap<unknown>(name);
        for (const k of [...cur.keys()]) if (!src.has(k)) cur.delete(k);
        for (const [k, v] of src.entries()) cur.set(k, clone(v));
      }
      this.doc.getMap<unknown>('settings').set('restored', { by, at: Date.now(), version });
    });
  }

  /** 문서 변경: 저장 먼저, 그다음 다른 접속자에게 전달 */
  private onUpdate(update: Uint8Array, origin: unknown) {
    if (origin === LOAD) return;
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT INTO updates (data) VALUES (?)', update);
    this.setMeta('changed', Date.now());
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
    return (ws.deserializeAttachment() as SocketAttachment).sid;
  }

  private roleOf(ws: WebSocket): Role {
    return (ws.deserializeAttachment() as SocketAttachment).role;
  }

  /** 위치 코멘트(핀) 추가 (RPC, viewer 용). 앱의 Project.addPin 과 같은 구조 */
  async addPin(photoId: string, x: number, y: number, author: string, to = '') {
    const pins = this.doc.getMap<Y.Map<unknown>>('pins');
    let number = 1;
    for (const m of pins.values()) if (m.get('photoId') === photoId) number++;
    const id = crypto.randomUUID();
    const m = new Y.Map<unknown>();
    const pin = { id, photoId, x, y, author, createdAt: Date.now(), resolved: false, number, ...(to ? { to } : {}) };
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(pin)) m.set(k, v);
      pins.set(id, m);
    });
    return pin;
  }

  /**
   * 제안 승인 기록 (RPC, viewer 도 가능). settings.approvals(JSON 배열)에 추가하고 대화에 승인 메시지를 남긴다 (objectId 'project').
   * 같은 트랜잭션으로 넣어 한 번에 전파된다
   */
  async addApproval(by: string, hash: string, snapshot: unknown, proposalId?: string, excluded: string[] = []): Promise<Approval> {
    const settings = this.doc.getMap<unknown>('settings');
    const a: Approval = { id: crypto.randomUUID(), at: Date.now(), by, hash, snapshot, ...(proposalId ? { proposalId } : {}), ...(excluded.length ? { excluded } : {}) };
    const total = (snapshot as { total?: number } | null)?.total;
    const text = `${by} 님이 진행에 동의했습니다 — 제작을 시작합니다${excluded.length ? ` (${excluded.length}개 제외)` : ''}${typeof total === 'number' ? ` · 합계 ${Math.round(total).toLocaleString('ko-KR')}원` : ''}`;
    this.doc.transact(() => {
      const prev = (settings.get('approvals') as Approval[] | undefined) ?? [];
      settings.set('approvals', [...prev, a]);
      this.doc.getArray<Message>('messages').push([{ id: crypto.randomUUID(), objectId: 'project', author: by, text, kind: 'approval', ts: a.at }]);
    });
    return a;
  }

  /** 제안 미리보기 이미지(첫 사진 주간 렌더)의 에셋 id — 카카오톡 OG 이미지용 */
  async proposalImageAsset(): Promise<string | null> {
    const p = this.doc.getMap<unknown>('settings').get('proposal') as { renders?: { day?: string }[] } | undefined;
    const id = p?.renders?.[0]?.day;
    return typeof id === 'string' ? id : null;
  }

  /** 톡 색인용 (2026-10-22): 방들(회사 멤버 방은 대화가 있을 때만)과 방별 마지막 메시지 */
  async talkIndex(): Promise<{ id: string; name: string; memberIds: string[]; createdById: string; last: { ts: number; text: string; author: string } | null }[]> {
    const last = new Map<string, { ts: number; text: string; author: string }>();
    for (const m of this.doc.getArray<Message>('messages').toArray()) {
      if (!m.objectId.startsWith('talk:')) continue;
      const id = m.objectId.slice(5), prev = last.get(id);
      if (!prev || m.ts >= prev.ts) last.set(id, { ts: m.ts, text: (m.text || (m.refs?.length ? m.refs.map((r) => r.label).join(', ') : m.attachments?.length ? '첨부' : '')).slice(0, 80), author: m.author });
    }
    const rooms = [...this.doc.getMap<Y.Map<unknown>>('talks').values()].map((t) => ({
      id: String(t.get('id') ?? ''), name: String(t.get('name') ?? ''), memberIds: ((t.get('memberIds') as string[] | undefined) ?? []).filter((x) => typeof x === 'string'), createdById: String(t.get('createdById') ?? ''),
    })).filter((r) => r.id);
    const out = rooms.map((r) => ({ ...r, last: last.get(r.id) ?? null }));
    if (last.has('team')) out.unshift({ id: 'team', name: '회사 멤버', memberIds: [], createdById: '', last: last.get('team')! });
    return out;
  }

  /** 한 톡방의 메시지 (메인 화면에서 읽기, 2026-10-22) */
  async talkMessages(roomId: string): Promise<Message[]> {
    return this.doc.getArray<Message>('messages').toArray().filter((m) => m.objectId === `talk:${roomId}`).slice(-200);
  }

  /** 대화·코멘트 추가 (RPC). 앱의 Project.addMessage 와 같은 구조로 messages 배열에 넣는다 */
  async addMessage(objectId: string, author: string, text: string, kind: Message['kind'], attachments?: Attachment[], refs?: Message['refs'], authorId?: string): Promise<Message> {
    const msg: Message = { id: crypto.randomUUID(), objectId, author, text, kind, ts: Date.now(), ...(attachments?.length ? { attachments } : {}), ...(refs?.length ? { refs } : {}), ...(authorId ? { authorId } : {}) };
    this.doc.getArray<Message>('messages').push([msg]);
    return msg;
  }

  /** 메시지 지우기 (RPC, 2026-10-18): byAuthor 가 있으면 그 작성자의 글만(viewer 는 자기 것만). 없으면 404, 남의 것이면 403 */
  async removeMessage(id: string, byAuthor?: string): Promise<200 | 403 | 404> {
    const arr = this.doc.getArray<Message>('messages');
    const i = arr.toArray().findIndex((m) => m.id === id);
    if (i < 0) return 404;
    if (byAuthor !== undefined && arr.get(i).author !== byAuthor) return 403;
    arr.delete(i, 1);
    return 200;
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
          'INSERT INTO awareness (client_id, sock, clock, state, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET sock = excluded.sock, clock = excluded.clock, state = excluded.state, updated_at = excluded.updated_at',
          e.clientId, sid, e.clock, e.state, Date.now(),
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
    // 오래 조용한 상태(닫힘 신호 없이 사라진 탭)는 정리하고 보내지 않는다
    this.ctx.storage.sql.exec('DELETE FROM awareness WHERE updated_at < ?', Date.now() - AWARENESS_TTL);
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
