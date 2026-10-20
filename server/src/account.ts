// 계정 하나 = Durable Object 하나.
// · 같은 아이디 동시 사용 (2026-10-21 "동시에 같은 아이디로 작동시 로그아웃 선택하도록 동시에 사용하지 않으면 로그인 유지"): 기기(device)마다 사용 중 신호(presence)를 30초마다 받고,
//   70초 넘게 신호가 없으면 쓰지 않는 것으로 본다. 다른 기기가 지금 쓰고 있으면 알려 주고, [다른 곳 로그아웃]이면 그 기기들의 신호를 지운다(세션은 auth 에서 지움).
// · (옛) 동시접속 좌석 — 2026-10-21 요금제 한도가 팀 멤버 수로 바뀌어 더 이상 쓰지 않는다. 표는 그대로 둔다
import { DurableObject } from 'cloudflare:workers';

/** 방 소켓이 메시지를 주고받을 때 30초마다 갱신하므로 90초면 비정상 종료로 본다 */
export const SEAT_TTL = 90_000;
/** 사용 중 신호는 30초마다 — 70초 넘게 없으면 그 기기는 쓰지 않는 것 */
export const PRESENCE_TTL = 70_000;

export interface SeatResult { ok: boolean; used: number; limit: number }

export class Account extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seats (sid TEXT PRIMARY KEY, person TEXT NOT NULL, updated_at INTEGER NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS presence (device TEXT PRIMARY KEY, session TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    });
  }

  private sweep() {
    this.ctx.storage.sql.exec('DELETE FROM seats WHERE updated_at < ?', Date.now() - SEAT_TTL);
  }

  private used(): number {
    return Number(this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(DISTINCT person) AS n FROM seats').one().n);
  }

  /** 소켓 sid 가 person 의 좌석을 요청. 이미 앉아 있는 사람(다른 탭)은 한도와 무관하게 허용 */
  async acquire(person: string, sid: string, limit: number): Promise<SeatResult> {
    this.sweep();
    const seated = this.ctx.storage.sql.exec('SELECT 1 FROM seats WHERE person = ? LIMIT 1', person).toArray().length > 0;
    const used = this.used();
    if (!seated && used >= limit) return { ok: false, used, limit };
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO seats (sid, person, updated_at) VALUES (?, ?, ?)', sid, person, Date.now());
    return { ok: true, used: seated ? used : used + 1, limit };
  }

  async renew(sid: string) {
    this.ctx.storage.sql.exec('UPDATE seats SET updated_at = ? WHERE sid = ?', Date.now(), sid);
  }

  async release(sid: string) {
    this.ctx.storage.sql.exec('DELETE FROM seats WHERE sid = ?', sid);
  }

  /** 이 기기가 지금 쓰는 중 — 다른 기기 중 지금 쓰는 곳의 수를 돌려준다 (같은 기기의 탭은 하나) */
  async beat(device: string, session: string): Promise<number> {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM presence WHERE updated_at < ?', now - PRESENCE_TTL);
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO presence (device, session, updated_at) VALUES (?, ?, ?)', device, session, now);
    return Number(this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM presence WHERE device != ?', device).one().n);
  }

  /** [다른 곳 로그아웃] — 이 기기 말고는 지운다. 끊을 세션들을 돌려준다 */
  async dropOthers(device: string): Promise<string[]> {
    const others = this.ctx.storage.sql.exec<{ session: string }>('SELECT session FROM presence WHERE device != ?', device).toArray().map((r) => r.session);
    this.ctx.storage.sql.exec('DELETE FROM presence WHERE device != ?', device);
    return others;
  }

  /** [여기서 로그아웃] — 이 기기의 신호를 지운다 */
  async leave(device: string) {
    this.ctx.storage.sql.exec('DELETE FROM presence WHERE device = ?', device);
  }

  async usedSeats(): Promise<number> {
    this.sweep();
    return this.used();
  }
}
