// 사양 글 표본 (2026-10-18 사용자: "메모로 전환하는 글만 모아서 ai로 전환하는 방식으로"):
// 퀵입력이 못 알아보고 요청사항(메모)으로 넘긴 부분이 있을 때만, 전체 글 + 못 알아본 부분 + 알아본 항목 라벨을 표본으로 만든다.
// 사용자가 확인 창에서 보내기를 켠 경우에만 서버로 — 글은 프로젝트에 저장하지 않는다는 원칙은 그대로
import type { SpecItem } from './specText';

export interface SpecSample { text: string; leftover: string; recognized: string[]; productId?: string }

export function sampleOf(text: string, items: SpecItem[], productId?: string): SpecSample | null {
  const note = items.find((i) => i.kind === 'note');
  if (!note || !note.text.trim()) return null;
  return {
    text: text.trim().slice(0, 300),
    leftover: note.text.trim().slice(0, 300),
    recognized: items.filter((i) => i.kind !== 'note').map((i) => i.label).slice(0, 30),
    ...(productId ? { productId } : {}),
  };
}
