// 출력면 색 vs 프레임 색, 색 누락 점검 (2026-10-17 사용자: "갈바나 후랙스 같이 프레임이 있는 경우 컬러를 넣을 수 있게. 현재 배경컬러는 인쇄물의 임시컬러를 지정한 경우로 프레임과 구분지어야한다. 속성을 조사해 컬러가 누락된곳을 찾아줘")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { bodyLook, frameHex, renderSpecOf } from '../../src/lib/core/render';
import { newPart } from '../../src/lib/core/parts';
import { layoutParts } from '../../src/lib/core/partsLayout';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const fields = (o: SignObject) => optionGroupsFor(o).flatMap((g) => g.fields);
const has = (o: SignObject, key: string) => fields(o).some((f) => f.key === key);
const label = (o: SignObject, key: string) => fields(o).find((f) => f.key === key)?.paint?.label;
const place = { cx: 0, cy: 0, w: 3000, h: 600 };

describe('프레임이 있는 종류에는 프레임 색, 인쇄물 면은 출력면 색(임시)', () => {
  it('후렉스·천갈이·라이트패널·패브릭·액자·어닝·지주·전광판·사인미러: framePaint 피커가 있다', () => {
    for (const id of ['board-flex', 'board-reface', 'board-lightpanel', 'board-fabric', 'frame-plain', 'board-awning', 'board-pole', 'board-ledsign', 'board-mirror', 'board-truss', 'board-pipe', 'board-galva']) {
      expect(has(obj({ productId: id }), 'framePaintSystem'), id).toBe(true);
    }
    expect(has(obj({ productId: 'frame-wood', options: { wood: '도색' } }), 'framePaintSystem')).toBe(true);
    expect(has(obj({ productId: 'frame-wood' }), 'framePaintSystem')).toBe(false); // 원목·월넛은 나무 그대로
  });
  it('후렉스의 face 는 "출력면 색 (인쇄물 임시)", 갈바는 도색(몸통 = 프레임)', () => {
    expect(label(obj({ productId: 'board-flex' }), 'faceSystem')).toBe('출력면 색 (인쇄물 임시)');
    expect(label(obj({ productId: 'board-flex' }), 'framePaintSystem')).toBe('프레임 색');
    expect(has(obj({ productId: 'board-galva' }), 'faceSystem')).toBe(false);
    expect(has(obj({ productId: 'board-galva' }), 'paintSystem')).toBe(true);
  });
  it('누락 보강: 돌출(후렉스 몸체) 출력면, 갈바 내부 조명 색, 채널 프레임·캡 색, 단색 시트 색', () => {
    expect(has(obj({ productId: 'board-protrude' }), 'faceSystem')).toBe(false);
    expect(has(obj({ productId: 'board-protrude', options: { body: '후렉스' } }), 'faceSystem')).toBe(true);
    expect(has(obj({ productId: 'board-galva' }), 'lightColor')).toBe(false);
    expect(has(obj({ productId: 'board-galva', options: { light: 'LED' } }), 'lightColor')).toBe(true);
    const ch = newPart('channel', 'ch-front');
    expect(partOptionFields(ch).some((f) => f.key === 'capSystem')).toBe(true); // 기본 캡
    ch.options = { chType: '일체형' };
    expect(partOptionFields(ch).some((f) => f.key === 'capSystem')).toBe(false);
    ch.options = { chFrame: '200폭' };
    expect(partOptionFields(ch).some((f) => f.key === 'chFramePaintSystem')).toBe(true);
    expect(partOptionFields(newPart('sheet', 'sh-cut')).some((f) => f.key === 'sheetSystem')).toBe(true);
    expect(partOptionFields(newPart('sheet', 'sh-print')).some((f) => f.key === 'sheetSystem')).toBe(false);
  });
});

describe('그리기: 앞면은 출력면 색, 상자 옆면·테는 프레임 색', () => {
  const flex = obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600, options: { faceSystem: '기본색', faceCode: '노랑', framePaintSystem: '기본색', framePaintCode: '검정' } });
  it('bodyLook 은 프레임 색을 앞면에 쓰지 않는다, frameHex 는 프레임 도색 > 몸통 도색', () => {
    expect(bodyLook(flex)!.color).toBe('#ffcc00');
    expect(bodyLook(obj({ productId: 'board-flex', options: { framePaintSystem: '기본색', framePaintCode: '검정' } }))!.color).toBe('#fff8e6'); // 프레임만 골라도 출력면은 기본
    expect(frameHex(flex)).toBe('#141414');
    expect(frameHex(obj({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '진회색' } }))).toBe('#3a3f44');
    expect(frameHex(obj({ productId: 'board-flex' }))).toBeNull();
  });
  it('renderSpecOf: faceColor = 출력면, sideColor = 프레임 (조합형도)', () => {
    const s = renderSpecOf(flex, place)!;
    expect(s.faceColor).toBe('#ffcc00');
    expect(s.sideColor).toBe('#141414');
    const ch = newPart('channel', 'ch-front'); ch.items = [{ id: 't', kind: 'text', text: '간판', x: 0, y: 0, h: 300 }];
    const s2 = renderSpecOf({ ...flex, parts: [ch] }, place)!;
    expect(s2.sideColor).toBe('#141414');
    expect(renderSpecOf(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 }), place)!.sideColor).toBe('#6b7075');
  });
  it('시트 색이 카드·3D 앞면 글자 색에', () => {
    const sh = newPart('sheet', 'sh-cut'); sh.options = { sheetSystem: '기본색', sheetCode: '빨강' }; sh.items = [{ id: 't', kind: 'text', text: '시트', x: 0, y: 0, h: 200 }];
    const o = obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600, parts: [sh] });
    expect(layoutParts(o, 3000, 600, 300, 60)[0].color).toBe('#d62828');
    expect(renderSpecOf(o, place)!.faceItems![0].color).toBe('#d62828');
  });
});
