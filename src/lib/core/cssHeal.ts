// 꾸밈 자가 복구 (2026-10-21 "css가 깨진 상태"): 휴대폰 캐시에 HTML 이 CSS 자리에 1년 저장된 경우(배포 직후 SPA 대체 응답 사고 — worker/guard.ts 가 이후 재발을 막는다)
// 전역 변수(--bg)가 안 보이면 같은 스타일시트를 **새 주소**(?r=시각)로 다시 단다 — 주소가 다르면 캐시를 건너뛰고 진짜 CSS 를 받는다

/** 전역 스타일이 안 먹었나 (:root 의 --bg 가 비어 있음) */
export const cssMissing = (bgVar: string) => !bgVar.trim();

/** 같은 파일의 캐시 우회 주소 */
export function healedHref(href: string, now: number): string {
  const u = new URL(href, 'https://x/');
  u.searchParams.set('r', String(now));
  return href.startsWith('http') ? u.toString() : u.pathname + u.search;
}
