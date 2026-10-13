// 계정 하나 = Durable Object 하나: 동시접속 좌석 계산 (1-2c)
// 좌석 = 사람(person) 단위. 소켓(sid)마다 임대하고, 90초 넘게 갱신이 없으면 만료.
import { DurableObject } from 'cloudflare:workers';

/** 방 소켓이 메시지를 주고받을 때 30초마다 갱신하므로 90초면 비정상 종료로 본다 */
export const SEAT_TTL = 90_000;

export interface SeatResult { ok: boolean; used: number; limit: number }

export class Account extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seats (sid TEXT PRIMARY KEY, person TEXT NOT NULL, updated_at INTEGER NOT NULL)');
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

  async usedSeats(): Promise<number> {
    this.sweep();
    return this.used();
  }
}
