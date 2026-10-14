import { describe, expect, it } from 'vitest';
import { bundleOf, newVersionAvailable } from '../../src/lib/core/version';

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
