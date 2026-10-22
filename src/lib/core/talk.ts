// 톡 (2026-10-22 사용자: "말풍선 제거한다 … 톡은 메인화면의 상단에 톡버튼 … 기본으로 회사 맴버 톡방이 있다")
// 톡방 메시지는 기존 대화 배열에 objectId = 'talk:<방 id>' 로 들어간다 (안 읽은 수·삭제·서버 RPC 를 그대로 쓴다).
import type { Message, TalkRef, TalkRoom } from './model';

/** 기본 방: 회사 멤버 (편집 권한이 있는 사람 = 회사 쪽). 저장하지 않는 고정 방 */
export const TEAM_ROOM: TalkRoom = { id: 'team', name: '회사 멤버', members: [], createdBy: '', createdAt: 0 };

export const roomKey = (roomId: string) => `talk:${roomId}`;
export const roomIdOf = (objectId: string): string | null => (objectId.startsWith('talk:') ? objectId.slice(5) : null);

const inRoom = (r: TalkRoom, me: string) => r.createdBy === me || r.members.includes(me);

/** 내가 볼 수 있는 방 — 회사 멤버 방(회사 쪽만)이 맨 앞, 나머지는 만든 순서 */
export function visibleRooms(rooms: TalkRoom[], me: string, isCompany: boolean): TalkRoom[] {
  const mine = rooms.filter((r) => r.id !== TEAM_ROOM.id && inRoom(r, me)).sort((a, b) => a.createdAt - b.createdAt);
  return isCompany ? [TEAM_ROOM, ...mine] : mine;
}

/** 이 메시지를 내가 볼 수 있나 — 톡 메시지는 방 멤버만, 그 밖(사인물 대화 등)은 그대로 */
export function canSeeTalkMessage(m: Message, rooms: TalkRoom[], me: string, isCompany: boolean): boolean {
  const id = roomIdOf(m.objectId);
  if (id === null) return true;
  return visibleRooms(rooms, me, isCompany).some((r) => r.id === id);
}

/** 보이는 방의 안 읽은 수 */
export function talkUnread(unread: Record<string, number>, rooms: TalkRoom[], me: string, isCompany: boolean): { total: number; byRoom: Record<string, number> } {
  const byRoom: Record<string, number> = {};
  let total = 0;
  for (const r of visibleRooms(rooms, me, isCompany)) {
    const n = unread[roomKey(r.id)] ?? 0;
    if (n) { byRoom[r.id] = n; total += n; }
  }
  return { total, byRoom };
}

/** 보낼 링크에 하나 더 — 같은 대상은 한 번만 */
export function addRef(refs: TalkRef[], ref: TalkRef): TalkRef[] {
  return refs.some((r) => r.kind === ref.kind && r.id === ref.id) ? refs : [...refs, ref];
}

export const refLabel = (r: TalkRef) => `${r.kind === 'photo' ? '📷' : r.kind === 'pin' ? '📍' : '🔗'} ${r.label}`;
