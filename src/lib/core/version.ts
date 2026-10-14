// 새 배포 감지: 실행 중인 번들(index-<hash>.js)과 서버의 index.html 이 가리키는 번들을 비교한다.
// 오래 열어 둔 탭이 옛 코드로 계속 동작하던 문제(2026-10-15 사용자 제보: 배포 뒤에도 패널 동작이 예전 그대로) → "새 버전" 배너 + 새로고침.

/** html 에서 메인 번들 이름(index-xxxx.js). 없으면 null (개발 서버) */
export function bundleOf(html: string): string | null {
  const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  return m ? m[1] : null;
}

/** 현재 문서가 실행 중인 번들 이름 */
export function runningBundle(doc: Document): string | null {
  for (const s of Array.from(doc.scripts)) { const b = bundleOf(s.src); if (b) return b; }
  return null;
}

/** 새 버전이 있으면 true. 번들 이름을 알 수 없으면(개발) false */
export async function newVersionAvailable(doc: Document, fetchHtml: () => Promise<string>): Promise<boolean> {
  const mine = runningBundle(doc);
  if (!mine) return false;
  try { const latest = bundleOf(await fetchHtml()); return !!latest && latest !== mine; } catch { return false; }
}
