// 일러스트 → 간판다 구성 요소 묶음 (.ganpanda) (2026-11-05 "일러스트 레이어를 생성하고 이걸 내보내서 자동으로 간판다에서 보여질 수 있게")
import { describe, expect, it } from 'vitest';
import { BUNDLE_FORMAT, bundleTargets, isBundleName, parseBundle, pngSize } from '../../src/lib/core/illustratorBundle';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR42mP8z8DwnwEJMCJ7ABBOAv+xFBY1AAAAAElFTkSuQmCC', 'base64'));

describe('illustratorBundle', () => {
  it('묶음 파일 이름·형식 검사', () => {
    expect(isBundleName('매장.ganpanda')).toBe(true);
    expect(isBundleName('매장.ai')).toBe(false);
    const ok = JSON.stringify({ format: BUNDLE_FORMAT, version: 1, items: [{ sign: 'a', part: 'frame', kind: 'png', data: 'AA==' }] });
    expect(parseBundle(ok)?.items).toHaveLength(1);
    expect(parseBundle('{"format":"x"}')).toBeNull();
    expect(parseBundle('not json')).toBeNull();
    // 잘못된 항목은 뺀다
    expect(parseBundle(JSON.stringify({ format: BUNDLE_FORMAT, version: 1, items: [{ sign: 'a', part: 'p', kind: 'gif', data: 'x' }, { sign: 'a', part: 'p', kind: 'svg', data: 'x' }] }))?.items).toHaveLength(1);
  });
  it('PNG 크기 (IHDR)', () => {
    expect(pngSize(PNG)).toEqual({ w: 3, h: 2 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('짝: 바탕(frame)은 사인물 바탕 디자인, 구성 요소는 그 id 가 있을 때만 — 없는 사인물·구성 요소는 뺀다', () => {
    const signs = [{ id: 'a', parts: ['c1', 's1'] }, { id: 'b', parts: [] }];
    const r = bundleTargets([
      { sign: 'a', part: 'frame', kind: 'png', data: '' }, { sign: 'a', part: 'c1', kind: 'svg', data: '' },
      { sign: 'a', part: 'zz', kind: 'svg', data: '' }, { sign: 'x', part: 'frame', kind: 'png', data: '' }, { sign: 'b', part: 'frame', kind: 'svg', data: '' },
    ], signs);
    expect(r.map((t) => [t.sign, t.part, t.kind])).toEqual([['a', 'frame', 'png'], ['a', 'c1', 'svg'], ['b', 'frame', 'svg']]);
  });
});
