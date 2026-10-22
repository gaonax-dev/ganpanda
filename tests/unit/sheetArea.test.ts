import { describe, expect, it } from 'vitest';
import { withSheetAreas } from '../../src/lib/core/sheetArea';
import type { SignObject, SignPart } from '../../src/lib/core/model';

const o = (parts: SignPart[]): SignObject => ({ id: 's', photoId: 'p', name: '큰시트', shape: 'rect', quad: [], sheetIds: [], widthMm: 2100, heightMm: 2100, parts } as unknown as SignObject);

// 2026-10-22 사용자: "시트 2d 3d에서 안나온다" — 글자 없이 면 전체에 붙이는 시트(큰시트·폴딩시트·안개)가 그려지지 않았다
describe('글자 없는 시트 = 올라간 면 전체', () => {
  it('프레임 면 위의 빈 시트는 사인물 전체를 덮는 사각형(시트 색)', () => {
    const [p] = withSheetAreas(o([{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', options: { sheetSystem: '기본색', sheetCode: '검정' }, items: [] }]));
    expect(p.items).toEqual([{ id: 'sh:area', kind: 'shape', shape: 'rect', fill: '#141414', x: 0, y: 0, w: 2100, h: 2100 }]);
  });

  it('안개 시트는 밝은 반투명색, UV 출력은 디자인 전 연회색', () => {
    const [f, u] = withSheetAreas(o([{ id: 'f', kind: 'sheet', type: 'sh-frost', on: 'frame', items: [] }, { id: 'u', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }]));
    expect(f.items[0].fill).toBe('#e9f0f5');
    expect(u.items[0].fill).toBe('#d9d9d9');
  });

  it('글자가 있는 시트·채널은 그대로, 채널 앞면의 빈 시트는 채널 글자 자리만', () => {
    const ps = withSheetAreas(o([
      { id: 'ch', kind: 'channel', type: 'ch-front', items: [{ id: 't', kind: 'text', text: 'AB', x: 100, y: 50, h: 200 }] },
      { id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'ch', items: [] },
      { id: 's2', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [{ id: 'x', kind: 'text', text: 'SALE', x: 0, y: 0, h: 100 }] },
    ]));
    expect(ps[0].items).toHaveLength(1);
    expect(ps[2].items.map((i) => i.id)).toEqual(['x']);
    expect(ps[1].items[0]).toMatchObject({ kind: 'shape', x: 100, y: 50, h: 200, w: 360 }); // 글자 상자 = 2자 × 200 × 0.9
  });

  it('치수가 없으면 그리지 않는다', () => {
    const [p] = withSheetAreas({ ...o([{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] }]), widthMm: undefined });
    expect(p.items).toEqual([]);
  });
});
