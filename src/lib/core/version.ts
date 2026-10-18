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

/**
 * 새 버전을 찾았을 때 바로 새로고침해도 되는가. 문서는 실시간 동기화로 저장되어 있으므로 새로고침해도 잃는 것이 없다.
 * returned = 탭이 백그라운드에서 돌아옴/뒤로가기 복원(사용자가 막 손대지 않은 상태), home = 홈 화면, busy = 입력 중이거나 창이 열림
 */
export function shouldAutoReload(s: { returned: boolean; busy: boolean; home?: boolean }): boolean {
  if (s.busy) return false;
  return s.returned || !!s.home;
}

/**
 * 새 버전을 찾아 새로고침할 때 같은 버전을 두고 **되풀이 새로고침**하지 않게 (2026-10-18 사용자: "모바일 재로딩으로 이 페이지를 열 수 없음").
 * 휴대폰 브라우저가 no-store 를 무시하고 옛 index.html 을 계속 주면: 옛 코드 → 새 버전 감지 → 새로고침 → 또 옛 코드 … 가 끝없이 돌아 "페이지를 열 수 없음"이 떴다.
 * 1회차 = 보통 새로고침, 2회차 = 주소에 `v=<번들>` 을 붙여 캐시를 우회, 3회차부터 = 배너만. 시도 횟수는 세션 저장소에 `<번들>:<횟수>`
 */
export type ReloadPlan = 'reload' | 'reload-bust' | 'banner';
export function reloadPlan(latest: string, store: { get(): string | null; set(v: string): void }): ReloadPlan {
  const raw = store.get() ?? '';
  const [b, n] = raw.split(':');
  const tries = b === latest ? Number(n) || 0 : 0;
  store.set(`${latest}:${tries + 1}`);
  return tries === 0 ? 'reload' : tries === 1 ? 'reload-bust' : 'banner';
}
/** 캐시 우회 주소: 기존 검색어는 두고 v=<번들> 만 더한다 (앱은 모르는 검색어를 무시한다) */
export function bustedUrl(href: string, latest: string): string {
  const u = new URL(href);
  u.searchParams.set('v', latest.replace(/^index-|\.js$/g, ''));
  return u.toString();
}
