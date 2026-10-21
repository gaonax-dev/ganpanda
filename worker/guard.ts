// 정적 에셋 지킴이 (2026-10-21 "모바일 계속 로딩중" → "css가 깨진 상태"):
// Workers 정적 에셋의 single-page-application 처리는 없는 경로에 index.html 을 **200** 으로 돌려주고, _headers 의 /assets/* 규칙이
// 거기에 1년 immutable 캐시를 붙인다. 배포 직후 새 index.html 을 받은 휴대폰이 아직 옛 버전인 POP 에 새 번들을 청하면 HTML 이 JS·CSS 로
// 내려와 브라우저·엣지에 1년 저장된다 → JS 가 HTML 이라 앱이 안 뜨고(로딩중), CSS 가 HTML 이라 꾸밈이 사라진다.
// 해시 경로가 없으면 진짜 404(no-store)로 — 브라우저가 다음에 다시 받는다.

/** 해시 이름 에셋 경로 (missing 이면 404 가 맞는 곳) */
export const GUARDED_PREFIXES = ['/assets/', '/env/'];

/** 에셋 경로인데 HTML 이 돌아왔다 = SPA 대체 응답 → 404 로 바꿔야 한다 */
export function isFallbackHtml(pathname: string, contentType: string | null): boolean {
  if (!GUARDED_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  return !!contentType && /text\/html/i.test(contentType);
}
