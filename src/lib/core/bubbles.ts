// 말풍선 = 게시물(사인물 영역·지점)을 지정해 소통하는 창구 (2026-10-17 사용자: "말풍선이 해당 게시물 또는 영역을 지정해서 소통하는 창구다 …
// 실제로는 현재 속성에 있는 대화 코멘트를 대체한다고 보면 된다. 말풍선에는 마지막 상태만 나오게").
// 보드 위 말풍선에는 그 대화의 **마지막 상태**(마지막 메시지 요약 또는 해결됨)만 짧게 보인다. 전체 대화는 말풍선을 눌러 연다
import type { Message } from './model';
import { describeAttachments } from './attachments';

export interface LastState { text: string; author: string; ts: number }

/** 이 대화(사인물 id 또는 말풍선 id)의 마지막 메시지 (없으면 null). 승인 알림 등 시스템 메시지도 상태로 친다 */
export function lastStateOf(messages: Message[], objectId: string): LastState | null {
  let last: Message | null = null;
  for (const m of messages) if (m.objectId === objectId && (!last || m.ts > last.ts)) last = m;
  if (!last) return null;
  const text = last.text?.trim() || describeAttachments(last.attachments ?? []) || '';
  return { text, author: last.author, ts: last.ts };
}

export const SNIPPET_MAX = 18;
/** 한 줄 요약: 첫 줄만, 길면 …  */
export function snippet(text: string, max = SNIPPET_MAX): string {
  const line = text.trim().split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** 말풍선에 보일 마지막 상태 글: 해결됨 > 마지막 메시지(작성자: 요약) > 아직 없음 */
export function bubbleLabel(opts: { resolved?: boolean; last: LastState | null; me?: string }): string {
  if (opts.resolved) return '✓ 해결됨';
  if (!opts.last) return '';
  const who = opts.me && opts.last.author === opts.me ? '나' : opts.last.author;
  return `${who}: ${snippet(opts.last.text)}`;
}
