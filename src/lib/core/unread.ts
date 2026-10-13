// 안 읽은 메시지·알림 규칙 (순수 함수)
import type { Message } from './model';

/** 사인물별로 내가 마지막으로 본 메시지 시각 */
export type SeenMap = Record<string, number>;

/** 내가 본 시각 이후에 남이 보낸 메시지 수 (0인 사인물은 빠짐) */
export function unreadByObject(messages: Message[], seen: SeenMap, me: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of messages) {
    if (m.author === me || m.ts <= (seen[m.objectId] ?? 0)) continue;
    out[m.objectId] = (out[m.objectId] ?? 0) + 1;
  }
  return out;
}

/** 사인물의 대화를 봤다 — 그 사인물 마지막 메시지 시각으로 (뒤로 가지 않음) */
export function markSeen(seen: SeenMap, objectId: string, messages: Message[]): SeenMap {
  let last = seen[objectId] ?? 0;
  for (const m of messages) if (m.objectId === objectId && m.ts > last) last = m.ts;
  return last === (seen[objectId] ?? 0) ? seen : { ...seen, [objectId]: last };
}

/** 남이 보낸 메시지이고, 그 대화를 보고 있지 않거나 탭이 숨겨져 있으면 알린다 */
export function shouldNotify(m: Message, ctx: { me: string; viewingObjectId: string | null; hidden: boolean }): boolean {
  if (m.author === ctx.me) return false;
  return ctx.hidden || ctx.viewingObjectId !== m.objectId;
}
