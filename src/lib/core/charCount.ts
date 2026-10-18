// 글자수 (잎 모듈 — 견적·구성 요소·정면도가 함께 쓴다)
/** 글자수: 수동 입력 우선, 없으면 문구에서 공백·줄바꿈 제외 */
export function charCountOf(o: { text?: string; charCount?: number }): number {
  if (o.charCount) return o.charCount;
  return [...(o.text ?? '')].filter((c) => c.trim()).length;
}
