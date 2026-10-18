// 레이어 트리 (1단계, 2026-10-18): parts ↔ layers 왕복, 부모 기준 좌표, 프레임 루트, 거울 규칙
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { commitParts, newItem, newPart, partsOf, categoryPatch } from '../../src/lib/core/parts';
import { FRAME_ID, flatten, findLayer, frameOf, fromParts, layersOf, sameParts, toParts } from '../../src/lib/core/layers';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });

describe('parts ↔ layers', () => {
  const ch = newPart('channel', 'ch-front'); ch.options = { chType: '캡' }; ch.items = [{ ...newItem('text'), text: '카페', h: 450, x: 100, y: -50 }];
  const frost = newPart('sheet', 'sh-cut'); frost.options = { sheetMat: '안개' };
  const logo = newPart('sheet', 'sh-print'); logo.on = frost.id; logo.items = [{ ...newItem('image'), h: 300, w: 300, x: 200, y: 0 }];
  const parts = [ch, frost, logo];
  it('올린 것(on)은 그 아래 자식으로, 글자·그림은 구성 요소의 자식으로', () => {
    const ls = fromParts(parts);
    expect(ls.map((l) => l.kind)).toEqual(['channel', 'sheet']); // logo 는 frost 아래
    expect(ls[0].spec).toEqual({ type: 'ch-front', chType: '캡' });
    expect(ls[0].children[0]).toMatchObject({ kind: 'text', spec: { text: '카페' }, box: { x: 100, y: -50, w: 0, h: 450 } });
    expect(ls[1].children.map((c) => c.id)).toEqual([logo.id]);
    expect(ls[1].children[0].children[0]).toMatchObject({ kind: 'image', box: { x: 200, y: 0, w: 300, h: 300 } });
  });
  it('왕복하면 같은 내용 (시트의 on 은 부모, 채널은 on 없음)', () => {
    const back = toParts(fromParts(parts));
    expect(sameParts(back, parts)).toBe(true);
    expect(back.find((p) => p.id === logo.id)!.on).toBe(frost.id);
    expect(back.find((p) => p.id === frost.id)!.on).toBe(FRAME_ID);
    expect(back.find((p) => p.id === ch.id)!.on).toBeUndefined();
  });
  it('좌표는 부모 기준: 부모를 옮기면 펼칠 때 더해진다', () => {
    const ls = fromParts(parts);
    ls[1].box = { x: 500, y: 100, w: 0, h: 0 }; // 안개 시트를 오른쪽 위로
    const back = toParts(ls);
    expect(back.find((p) => p.id === logo.id)!.items[0]).toMatchObject({ x: 700, y: 100 }); // 200 + 500
    expect(flatten(ls).find((f) => f.layer.id === logo.id)!.abs).toMatchObject({ x: 500, y: 100 });
    expect(findLayer(ls, logo.id)?.kind).toBe('sheet');
  });
  it('없는 id 위에 올린 시트는 프레임 면으로', () => {
    const orphan = { ...logo, on: 'nope' };
    expect(fromParts([orphan]).map((l) => l.id)).toEqual([logo.id]);
  });
});

describe('저장 규칙: layers + 거울 parts', () => {
  it('commitParts 는 트리와 펼친 형식을 함께 쓴다', () => {
    const sh = newPart('sheet', 'sh-print');
    const patch = commitParts({ options: { channel: '전광 채널', frameMat: '스텐' } }, [sh]);
    expect(patch.layers![0]).toMatchObject({ id: sh.id, kind: 'sheet' });
    expect(patch.parts).toEqual([sh]);
    expect(patch.options).toEqual({ frameMat: '스텐' });
    expect(categoryPatch(obj({ productId: 'board-galva', parts: [sh] }), 'sign', 'board-flex').layers).toHaveLength(1);
  });
  it('layersOf: 저장된 트리가 parts 와 같으면 그것, 다르면(옛 클라이언트가 parts 만 고침) parts 에서 다시', () => {
    const ch = newPart('channel', 'ch-halo'); ch.items = [{ ...newItem('text'), text: 'A', h: 300 }];
    const o = obj({ productId: 'board-galva', ...commitParts({}, [ch]) });
    expect(layersOf(o, partsOf(o))).toBe(o.layers);
    const edited = { ...o, parts: [{ ...ch, items: [{ ...ch.items[0], text: 'B' }] }] };
    const ls = layersOf(edited, partsOf(edited));
    expect(ls).not.toBe(o.layers);
    expect(ls[0].children[0].spec.text).toBe('B');
  });
  it('트리만 있는 사인물도 partsOf 로 읽힌다', () => {
    const ch = newPart('channel', 'ch-halo'); ch.items = [{ ...newItem('text'), text: 'A', h: 300 }];
    const o = obj({ productId: 'board-galva', layers: fromParts([ch]) });
    expect(partsOf(o)).toMatchObject([{ id: ch.id, kind: 'channel', items: [{ text: 'A', h: 300 }] }]);
  });
  it('옛 데이터(채널 옵션·문구)도 트리로 보인다', () => {
    const o = obj({ productId: 'board-galva', text: '간판다', options: { channel: '전광 채널', chHeight: '400' } });
    const ls = layersOf(o, partsOf(o));
    expect(ls[0]).toMatchObject({ kind: 'channel', spec: { type: 'ch-front' } });
    expect(ls[0].children[0]).toMatchObject({ kind: 'text', spec: { text: '간판다' }, box: { h: 400 } });
  });
  it('프레임 레이어 = 사인물 자체 (종류·옵션·두께·치수)', () => {
    const o = obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, depthMm: 100, options: { frameMat: '스텐' } });
    const f = frameOf(o, layersOf(o, partsOf(o)));
    expect(f).toMatchObject({ id: FRAME_ID, kind: 'frame', spec: { productId: 'board-galva', frameMat: '스텐', depthMm: 100 }, box: { w: 3000, h: 600 } });
  });
});
