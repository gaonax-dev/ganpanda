import { describe, expect, it } from 'vitest';
import { crossSection } from '../../src/lib/core/crossSection';
import type { SignObject, SignPart } from '../../src/lib/core/model';

const sign = (parts: SignPart[], extra: Partial<SignObject> = {}): SignObject => ({ id: 's', photoId: 'p', name: '간판', shape: 'rect', quad: [], sheetIds: [], productId: 'board-galva', widthMm: 4000, heightMm: 900, depthMm: 60, parts, ...extra } as SignObject);
const text = (id: string, x: number, h: number, t: string) => ({ id, kind: 'text' as const, text: t, x, y: 0, h });

// 2026-10-22 사용자: "예를들어 갈바 위에 체널과 아크릴스카시가 있다면 두개가 같은 층에 있다"
describe('단면 쌓기 — 층 = 올린 곳', () => {
  it('프레임 위의 채널과 스카시는 같은 2층, 채널 앞면의 시트는 3층, 부속(조명)은 층이 아니다', () => {
    const cs = crossSection(sign([
      { id: 'ch', kind: 'channel', type: 'ch-front', items: [text('t1', -1000, 500, '카페')] },
      { id: 'sc', kind: 'scashi', type: 'ch-scashi', items: [text('t2', 1200, 300, 'CAFE')] },
      { id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'ch', items: [] },
      { id: 'li', kind: 'light', type: 'top-2', items: [] },
    ]));
    expect(cs.frame).toMatchObject({ depth: 60 });
    expect(cs.tiers.map((t) => [t.n, t.items.map((i) => i.part.id)])).toEqual([[2, ['ch', 'sc']], [3, ['sh']]]);
    expect(cs.extras.map((p) => p.id)).toEqual(['li']);
    // 정면도 가로 자리 그대로: 채널은 왼쪽, 스카시는 오른쪽
    const [ch, sc] = cs.tiers[0].items;
    expect(ch.x1).toBeLessThan(sc.x0);
    expect(ch.x0).toBeGreaterThanOrEqual(-2000);
    // 올린 곳 위의 시트는 그 구성 요소 깊이 앞에서 시작
    expect(cs.tiers[1].items[0].z0).toBeCloseTo(60 + ch.depth);
  });

  it('스카시는 재료 층(뒤→앞)을 그대로 — 두께 합이 깊이', () => {
    const cs = crossSection(sign([{ id: 'sc', kind: 'scashi', type: 'sc-rubber', stack: [
      { id: 'a', material: 'iron', thickness: 1.5, role: 'base' }, { id: 'b', material: 'rubber', thickness: 20, role: 'body' },
    ], items: [text('t', 0, 300, '간판')] }]));
    const it = cs.tiers[0].items[0];
    expect(it.layers.map((l) => [l.label, l.thickness])).toEqual([['철판', 1.5], ['고무', 20]]);
    expect(it.depth).toBeCloseTo(21.5);
  });

  it('몸통이 없는 사인물(시트 분류)은 프레임 없이 1층부터, 글자가 없으면 가로 전체', () => {
    const cs = crossSection(sign([{ id: 'sh', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }], { productId: undefined, depthMm: undefined }), { hasBody: false });
    expect(cs.frame).toBeNull();
    expect(cs.tiers[0].n).toBe(1);
    expect(cs.tiers[0].items[0]).toMatchObject({ x0: -2000, x1: 2000 });
  });

  it('층 줄 요약: "2층 · 프레임 면 위 — 채널, 스카시"', () => {
    const cs = crossSection(sign([
      { id: 'ch', kind: 'channel', type: 'ch-front', items: [] }, { id: 'sc', kind: 'scashi', type: 'ch-scashi', items: [] },
    ]));
    expect(cs.tiers[0].summary).toBe('2층 · 프레임 면 위 — 채널, 스카시');
  });
});
