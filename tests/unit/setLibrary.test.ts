// 세트 라이브러리 (2026-10-19 4단계): 저장·비율 맞춰 넣기
import { describe, expect, it } from 'vitest';
import { fitScale, insertSet, rootsArePartsOnly, scaleLayers, setFrom, validSetLibrary } from '../../src/lib/core/setLibrary';
import { fromParts, toParts } from '../../src/lib/core/layers';
import { newItem, newPart } from '../../src/lib/core/parts';

const mk = () => {
  const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), id: 't1', text: '카페', h: 600, x: -1000, y: 0 }, { ...newItem('shape'), id: 's1', h: 200, w: 400, x: 1000, y: 100 }];
  return fromParts([ch]);
};

describe('세트', () => {
  it('체크한 레이어만, 없으면 전체 — 사인물 크기를 기준으로 기억하고 썸네일을 만든다', () => {
    const layers = mk();
    const whole = setFrom(layers, [], { widthMm: 6000, heightMm: 900 }, '간판 전체')!;
    expect(whole.layers).toHaveLength(1); expect(whole.frame).toEqual({ w: 6000, h: 900 }); expect(whole.thumb).toMatch(/^data:image\/svg\+xml/);
    const part = setFrom(layers, ['t1', 's1'], { widthMm: 6000, heightMm: 900 }, ' 제목 ')!;
    expect(part.name).toBe('제목'); expect(part.layers.map((l) => l.id)).toEqual(['t1', 's1']);
    expect(setFrom(layers, ['없음'], { widthMm: 6000, heightMm: 900 }, 'x')).toBeNull();
  });
  it('넣을 때 비율 유지(작은 쪽), id 는 새로, 구성 요소뿐이면 프레임 아래·객체 세트는 고른 구성 요소 아래', () => {
    const layers = mk();
    const whole = setFrom(layers, [], { widthMm: 6000, heightMm: 900 }, '전체')!;
    const small = { widthMm: 3000, heightMm: 900 };
    expect(fitScale(whole, small)).toBe(0.5);
    expect(rootsArePartsOnly(whole.layers)).toBe(true);
    const tree = insertSet([], whole, small)!;
    expect(tree).toHaveLength(1); expect(tree[0].id).not.toBe(layers[0].id);
    const items = toParts(tree)[0].items;
    expect(items.map((i) => [i.x, i.h, i.w])).toEqual([[-500, 300, undefined], [500, 100, 200]]);
    const sub = setFrom(layers, ['t1', 's1'], { widthMm: 6000, heightMm: 900 }, '제목')!;
    expect(rootsArePartsOnly(sub.layers)).toBe(false);
    expect(insertSet(layers, sub, small)).toBeNull(); // 넣을 구성 요소를 안 골랐다
    const into = insertSet(layers, sub, small, layers[0].id)!;
    expect(into[0].children).toHaveLength(4);
    expect(new Set(into[0].children.map((c) => c.id)).size).toBe(4); // 새 id
    expect(fitScale(whole, {})).toBe(1); // 크기 없으면 그대로
  });
  it('배율은 좌표·크기 모두, 형식 검사', () => {
    const k = scaleLayers(mk(), 2);
    expect(k[0].children[0].box).toEqual({ x: -2000, y: 0, w: 0, h: 1200 });
    expect(validSetLibrary({ version: 1, sets: [] })).toBe(true);
    expect(validSetLibrary({ version: 2, sets: [] })).toBe(false);
  });
});
