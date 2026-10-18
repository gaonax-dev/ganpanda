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

// 2단계 (2026-10-18): 그룹·도형·깊이 누적
describe('2단계: 그룹은 투명, 도형 왕복, 깊이 누적', async () => {
  const { GROUP_KIND, canHold, placedItems } = await import('../../src/lib/core/layers');
  it('그룹 안의 객체는 가장 가까운 구성 요소에 거두고 오프셋이 더해진다 (거울에서 그룹은 사라짐)', () => {
    const ch = newPart('channel', 'ch-front');
    const ls = fromParts([ch]);
    ls[0].children.push({ id: 'g', kind: GROUP_KIND, spec: {}, box: { x: 1000, y: 200, w: 0, h: 0 }, children: [
      { id: 't1', kind: 'text', spec: { text: 'A' }, box: { x: -100, y: 0, w: 0, h: 300 }, children: [] },
      { id: 's1', kind: 'shape', spec: { shape: 'ellipse', fill: '#ff0000' }, box: { x: 200, y: 50, w: 400, h: 300 }, children: [] },
    ] });
    const back = toParts(ls);
    expect(back).toHaveLength(1);
    expect(back[0].items).toEqual([
      expect.objectContaining({ id: 't1', kind: 'text', text: 'A', x: 900, y: 200, h: 300 }),
      expect.objectContaining({ id: 's1', kind: 'shape', shape: 'ellipse', fill: '#ff0000', x: 1200, y: 250, w: 400, h: 300 }),
    ]);
    expect(fromParts(back)[0].children.map((c) => c.kind)).toEqual(['text', 'shape']); // 그룹 없이 다시 — 도형은 spec 으로 돌아온다
    expect(fromParts(back)[0].children[1].spec).toEqual({ shape: 'ellipse', fill: '#ff0000' });
  });
  it('받을 수 있는 자식: 프레임 = 구성 요소·그룹, 채널 = 글자·그림·도형·시트·그룹, 스카시 = 시트 못 받음, 그룹 = 부모와 같음', () => {
    expect(canHold(FRAME_ID, 'channel')).toBe(true); expect(canHold(FRAME_ID, 'text')).toBe(false); expect(canHold(FRAME_ID, GROUP_KIND)).toBe(true);
    expect(canHold('channel', 'sheet')).toBe(true); expect(canHold('channel', 'shape')).toBe(true); expect(canHold('channel', 'channel')).toBe(false);
    expect(canHold('scashi', 'sheet')).toBe(false); expect(canHold('sheet', 'sheet')).toBe(true);
    expect(canHold(GROUP_KIND, 'text', ['channel'])).toBe(true); expect(canHold(GROUP_KIND, 'text', [])).toBe(false);
  });
  it('깊이 누적: 채널 앞면 위 시트의 그림은 채널 두께만큼 앞, 채널 글자는 0, 시트 위 시트는 0', () => {
    const ch = newPart('channel', 'ch-front'); ch.items = [{ ...newItem('text'), text: 'A', h: 300 }];
    const onCh = newPart('sheet', 'sh-print'); onCh.on = ch.id; onCh.items = [{ ...newItem('image'), h: 100, w: 100 }];
    const base = newPart('sheet', 'sh-cut'); const top = newPart('sheet', 'sh-print'); top.on = base.id; top.items = [{ ...newItem('image'), h: 50, w: 50 }];
    const depth = (p: { kind: string }) => (p.kind === 'channel' ? 80 : 0);
    const placed = placedItems(fromParts([ch, onCh, base, top]), depth);
    expect(placed.map((x) => [x.item.kind, x.part.id, x.z])).toEqual([['text', ch.id, 0], ['image', onCh.id, 80], ['image', top.id, 0]]);
  });
});

