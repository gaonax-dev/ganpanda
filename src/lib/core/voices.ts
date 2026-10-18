// 음성 메모 (2026-10-18 사용자: "말풍선으로 녹음이 들어있네 나중에 많아지면 복잡하다 … 정면도 아이템 제목 앞과 인디케이터 사이에 녹음 아이콘과 파일 수, 상세에 말풍선 옆에 녹음 파일 아이콘").
// 녹음은 대화(chat/comment)와 섞지 않고 kind 'voice' 메시지로 따로 둔다 — 같은 동기화·첨부 경로를 쓰되 말풍선 창에는 안 나오고, 카드·상세의 🎙 로 센다
import type { Message } from './model';

export const isVoice = (m: Pick<Message, 'kind'>) => m.kind === 'voice';

/** 사인물(대화 id = sameAs ?? id)의 음성 메모, 최신 먼저 */
export function voicesOf(messages: Message[], chatId: string): Message[] {
  return messages.filter((m) => m.objectId === chatId && isVoice(m)).sort((a, b) => b.ts - a.ts);
}

/** 사인물별 음성 메모 수 (0 은 빠짐) */
export function voiceCounts(messages: Message[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of messages) if (isVoice(m)) out[m.objectId] = (out[m.objectId] ?? 0) + 1;
  return out;
}
