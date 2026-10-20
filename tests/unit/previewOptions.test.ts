// 실제 사양과 미리보기 구분 (2026-10-21 사용자: "실재 옵션과 미리보기를 구분하지 않았어" → "미리보기로 하고 디자인은 별도로 하면 된다. 미리보기를 디자이너도 확인 가능하다")
import { describe, expect, it } from 'vitest';
import { addPrintItem, partsOf, partSpecOf } from '../../src/lib/core/parts';
import { describeOptions, effectiveOptions, optionGroupsFor } from '../../src/lib/core/options';
import { componentOf } from '../../src/lib/core/components';
import { layoutParts } from '../../src/lib/core/partsLayout';
import { renderSpecOf } from '../../src/lib/core/render';
import type { SignObject } from '../../src/lib/core/model';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: '후렉스', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const flex = (o: Partial<SignObject> = {}) => obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600, options: { faceSystem: '기본색', faceCode: '흰색' }, ...o });

describe('미리보기 옵션 (배경색)', () => {
  it('후렉스·현수막·액자의 배경색은 "미리보기" 묶음에 따로 — 이름 "배경색 (미리보기)", 사양 묶음에는 없다', () => {
    for (const id of ['board-flex', 'board-reface', 'banner', 'frame-plain']) {
      const gs = optionGroupsFor(obj({ productId: id }));
      const pv = gs.find((g) => g.preview)!;
      expect(pv, id).toBeDefined();
      expect(pv.title).toBe('미리보기');
      expect(pv.fields.find((f) => f.key === 'faceSystem')!.paint!.label).toBe('배경색 (미리보기)');
      expect(gs.filter((g) => !g.preview).flatMap((g) => g.fields).some((f) => f.key === 'faceSystem'), id).toBe(false);
    }
  });
  it('요약·주문 옵션에는 미리보기 값이 들어가지 않는다 (실제 도색·프레임 색은 들어간다)', () => {
    const o = flex({ options: { faceSystem: '기본색', faceCode: '흰색', framePaintSystem: '기본색', framePaintCode: '검정' } });
    const s = describeOptions(o).join(' ');
    expect(s).not.toContain('흰색');
    expect(s).toContain('검정');
    expect(Object.keys(effectiveOptions(o))).not.toContain('faceSystem');
    expect(Object.keys(effectiveOptions(o))).toContain('framePaintSystem');
  });
});

describe('미리보기 글자·그림 (출력 구성 요소)', () => {
  it('구성내역 "출력 미리보기 (디자이너 참고)", 칩 "미리보기"', () => {
    const o = flex();
    const p = partsOf({ ...o, ...addPrintItem(o, 'text').patch })[0];
    expect(partSpecOf(p)).toBe('출력 미리보기 (디자이너 참고)');
    expect(componentOf('sheet').chip(p).text).toBe('미리보기');
  });
  it('디자인 파일이 붙으면 미리보기 글자·그림은 2D·3D 에서 숨고(디자인이 실제 원고), 없으면 보인다', () => {
    const o = flex();
    const withText = { ...o, ...addPrintItem(o, 'text').patch };
    const ps = partsOf(withText); ps[0].items[0].text = '간판다';
    const shown = { ...withText, parts: ps, layers: undefined };
    expect(layoutParts(shown, 3000, 600, 300, 60)).toHaveLength(1);
    const designed = { ...shown, design: { sourceId: 's', page: 0, crop: { x: 0, y: 0, w: 100, h: 20 } } } as SignObject;
    expect(layoutParts(designed, 3000, 600, 300, 60)).toHaveLength(0);
    const place = { cx: 0, cy: 0, w: 3000, h: 600 } as never;
    expect(renderSpecOf(shown, place)!.faceItems?.length ?? 0).toBe(1);
    expect(renderSpecOf(designed, place)!.faceItems?.length ?? 0).toBe(0);
  });
});
