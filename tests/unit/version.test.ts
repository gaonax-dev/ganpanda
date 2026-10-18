import { describe, expect, it } from 'vitest';
import { bundleOf, newVersionAvailable, bustedUrl, reloadPlan } from '../../src/lib/core/version';

describe('새 배포 감지', () => {
  it('index.html 에서 번들 이름을 뽑는다 (개발 서버 html 은 null)', () => {
    expect(bundleOf('<script type="module" crossorigin src="/assets/index-BaQm4Z86.js"></script>')).toBe('index-BaQm4Z86.js');
    expect(bundleOf('<script type="module" src="/src/main.ts"></script>')).toBeNull();
  });
  it('실행 중인 번들과 서버의 번들이 다르면 새 버전', async () => {
    const doc = { scripts: [{ src: 'https://ganpanda.co.kr/assets/index-OLD00000.js' }] } as unknown as Document;
    expect(await newVersionAvailable(doc, async () => '<script src="/assets/index-NEW00000.js">')).toBe(true);
    expect(await newVersionAvailable(doc, async () => '<script src="/assets/index-OLD00000.js">')).toBe(false);
    expect(await newVersionAvailable(doc, async () => { throw new Error('offline'); })).toBe(false);
    expect(await newVersionAvailable({ scripts: [] } as unknown as Document, async () => '<script src="/assets/index-NEW00000.js">')).toBe(false);
  });
});

describe('새 버전 자동 적용', async () => {
  const { shouldAutoReload } = await import('../../src/lib/core/version');
  it('백그라운드에서 돌아왔거나(복원 포함) 홈이면 바로 새로고침, 입력·창이 열려 있으면 배너만', () => {
    expect(shouldAutoReload({ returned: true, busy: false })).toBe(true);
    expect(shouldAutoReload({ returned: false, busy: false, home: true })).toBe(true);
    expect(shouldAutoReload({ returned: true, busy: true })).toBe(false);
    expect(shouldAutoReload({ returned: false, busy: false })).toBe(false);
  });
});

// 2026-10-18 사용자: "모바일 재로딩으로 이 페이지를 열 수 없음" — 같은 버전을 두고 되풀이 새로고침 금지
describe('reloadPlan: 1회 새로고침 → 2회 캐시 우회 → 3회부터 배너', () => {
  const mem = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };
  it('같은 번들이면 횟수가 쌓이고, 다른 번들이면 처음부터', () => {
    const st = mem();
    expect(reloadPlan('index-A.js', st)).toBe('reload');
    expect(reloadPlan('index-A.js', st)).toBe('reload-bust');
    expect(reloadPlan('index-A.js', st)).toBe('banner');
    expect(reloadPlan('index-A.js', st)).toBe('banner');
    expect(reloadPlan('index-B.js', st)).toBe('reload');
  });
  it('bustedUrl: 기존 검색어는 두고 v 만 더한다', () => {
    expect(bustedUrl('https://ganpanda.co.kr/?room=abc', 'index-Ckg970__.js')).toBe('https://ganpanda.co.kr/?room=abc&v=Ckg970__');
    expect(bustedUrl('https://ganpanda.co.kr/?v=old', 'index-N.js')).toBe('https://ganpanda.co.kr/?v=N');
  });
});
