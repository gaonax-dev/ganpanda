// 말풍선(위치 코멘트)의 받는 사람 (2026-10-17 사용자: "툴바에서 핀을 말 풍선으로 변경하고 해당 말 풍선은 받는 사람이 있다. 모두가 보게 할 수도 있다").
// to 가 비어 있으면 모두에게. 받는 사람이 있으면 보낸 사람·받는 사람·소유자만 본다(소유자는 프로젝트 전체를 관리하므로)
import type { Message, Pin } from './model';

export const EVERYONE = '';

/** 이 사람(me, 역할 role)에게 이 말풍선이 보이는가 */
export function pinVisibleTo(pin: Pick<Pin, 'to' | 'author'>, me: string, role: 'owner' | 'editor' | 'viewer' | null): boolean {
  if (!pin.to) return true;
  return pin.to === me || pin.author === me || role === 'owner';
}

export const recipientLabel = (pin: Pick<Pin, 'to'>) => (pin.to ? pin.to : '모두');

/** 받는 사람 후보: 지금 접속한 사람 + 대화·말풍선에 등장한 사람 (나 제외, 이름순) */
export function participantsOf(peerNames: string[], messages: Pick<Message, 'author'>[], pins: Pick<Pin, 'author' | 'to'>[], me: string): string[] {
  const names = new Set<string>();
  for (const n of peerNames) if (n.trim()) names.add(n.trim());
  for (const m of messages) if (m.author.trim()) names.add(m.author.trim());
  for (const p of pins) { if (p.author.trim()) names.add(p.author.trim()); if (p.to?.trim()) names.add(p.to.trim()); }
  names.delete(me);
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}
