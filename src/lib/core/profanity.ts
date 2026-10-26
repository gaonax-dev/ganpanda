// 욕설 거르기 (2026-10-26 신고·차단 — 앱스토어 1.2 "부적절한 콘텐츠를 거르는 방법"): 말풍선·톡을 보낼 때 같은 길이의 * 로 가린다.
// 낱말 목록은 자주 쓰는 것만 — 빠진 것은 신고·차단으로. 뒤에 다른 글자가 붙어 다른 낱말이 되는 경우(시발점)는 예외로 둔다
const WORDS = ['씨발', '씨바', '시발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새끼', '개새', '지랄', '좆', '존나', '좃', '미친놈', '미친년', '썅', '닥쳐', 'fuck', 'shit', 'bitch', 'asshole'];
const EXCEPT = ['시발점', '시발역'];

export function maskProfanity(text: string): string {
  if (!text) return text;
  let out = text;
  const lower = text.toLowerCase();
  const keep = new Set<number>();
  for (const e of EXCEPT) { let i = lower.indexOf(e); while (i >= 0) { for (let k = i; k < i + e.length; k++) keep.add(k); i = lower.indexOf(e, i + 1); } }
  for (const w of [...WORDS].sort((a, b) => b.length - a.length)) {
    let i = lower.indexOf(w);
    while (i >= 0) {
      if (![...Array(w.length).keys()].some((k) => keep.has(i + k))) out = out.slice(0, i) + '*'.repeat(w.length) + out.slice(i + w.length);
      i = lower.indexOf(w, i + w.length);
    }
  }
  return out;
}
