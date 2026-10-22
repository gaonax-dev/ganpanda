import { describe, expect, it } from 'vitest';
import { hasFrost, withSheetAreas } from '../../src/lib/core/sheetArea';
import { renderSpecOf } from '../../src/lib/core/render';
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

  it('치수가 없으면 넘겨 준 크기(추정 치수·그린 자리)로 — 넘겨 준 크기도 없으면 그리지 않는다', () => {
    const unsized = { ...o([{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] }]), widthMm: undefined, heightMm: undefined };
    expect(withSheetAreas(unsized)[0].items).toEqual([]);
    expect(withSheetAreas(unsized, undefined, { w: 300, h: 120 })[0].items[0]).toMatchObject({ x: 0, y: 0, w: 300, h: 120 });
  });

  // 2026-10-22 사용자: "시트가 2d 3d에 적용이 안됐어" — 치수를 넣지 않은 시트 사인물(와이드·윗창)
  it('3D: 치수 없는 시트 사인물도 그린 자리 크기로 면을 칠한다', () => {
    const unsized = { ...o([{ id: 'sh', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }]), widthMm: undefined, heightMm: undefined };
    const spec = renderSpecOf(unsized, { cx: 0, cy: 0, w: 2400, h: 900 } as never);
    expect(spec?.faceItems?.some((f) => f.kind === 'shape' && f.fill === '#d9d9d9' && Math.abs(f.w - 2400) < 1)).toBe(true);
  });
});

// 2026-10-22 사용자: "3d에서 문제가 있어 비정상적으로 커지는거" — 치수 없는 사인물의 글자가 3D 에서 추정 치수로 줄지 않았다
describe('3D: 치수 없는 사인물은 추정 치수로 글자·면 축척', () => {
  it('추정 치수를 넘기면 글자 높이 = 글자 mm × (그린 폭 / 추정 폭)', () => {
    const unsized = { ...o([{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [{ id: 't', kind: 'text', text: '푸르미도그', x: 0, y: 0, h: 171 }] }]), widthMm: undefined, heightMm: undefined };
    const spec = renderSpecOf(unsized, { cx: 0, cy: 0, w: 500, h: 500 } as never, { w: 2000, h: 2000 });
    const t = spec!.faceItems!.find((f) => f.kind === 'text')!;
    expect(t.h).toBeCloseTo(171 * (500 / 2000));
  });
});

// 2026-10-22 사용자: "3d에서는 시트를 무조건 힌회색으로 막는다. 투명이 없어"
describe('시트는 붙는 면을 가리지 않는다 — 몸통 없는 시트는 투명 바탕, 안개는 반투명', () => {
  const glass = (parts: SignPart[]) => ({ ...o(parts) });
  it('3D: 시트만 있는 사인물은 바탕이 투명(clearFace) — 글자 시트는 글자만', () => {
    const spec = renderSpecOf(glass([{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [{ id: 't', kind: 'text', text: 'OPEN', x: 0, y: 0, h: 300 }] }]), { cx: 0, cy: 0, w: 2100, h: 2100 } as never);
    expect(spec?.clearFace).toBe(true);
  });
  // 2026-10-22 사용자: "안개는 블러처리하면되는데" — 면은 아주 옅게, 뒤는 블러(화면 층, hasFrost)
  // "안개는 화이트 없이 지금 블러에 10배" — 면 색 없음(0), 블러만
  it('안개 시트: 면 색 없음(0), 블러 대상', () => {
    const frost = o([{ id: 'f', kind: 'sheet', type: 'sh-frost', on: 'frame', items: [] }]);
    const [p] = withSheetAreas(frost);
    expect(p.items[0].opacity).toBe(0);
    const spec = renderSpecOf(frost, { cx: 0, cy: 0, w: 2100, h: 2100 } as never);
    expect(spec?.faceItems?.find((f) => f.kind === 'shape')?.opacity).toBe(0);
    expect(hasFrost(frost)).toBe(true);
    expect(hasFrost(o([{ id: 'c', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] }]))).toBe(false);
  });
  it('재질 시트(컷팅 없음)·UV 출력은 불투명', () => {
    const [c, u] = withSheetAreas(o([{ id: 'c', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] }, { id: 'u', kind: 'sheet', type: 'sh-print', on: 'frame', items: [] }]));
    expect(c.items[0].opacity).toBeUndefined();
    expect(u.items[0].opacity).toBeUndefined();
  });
});

describe('2D: 안개 시트 반투명', () => {
  it('layoutParts·SVG 에 fill-opacity', async () => {
    const { layoutParts, partsSvg } = await import('../../src/lib/core/partsLayout');
    const laid = layoutParts(o([{ id: 'f', kind: 'sheet', type: 'sh-frost', on: 'frame', items: [] }]), 2100, 2100, 210, 210);
    expect(laid[0].opacity).toBe(0);
    expect(partsSvg(laid, () => undefined)).toContain('fill-opacity="0.00"');
  });
});
