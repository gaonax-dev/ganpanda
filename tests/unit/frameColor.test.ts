// 출력면 색 vs 프레임 색, 색 누락 점검 (2026-10-17 사용자: "갈바나 후랙스 같이 프레임이 있는 경우 컬러를 넣을 수 있게. 현재 배경컬러는 인쇄물의 임시컬러를 지정한 경우로 프레임과 구분지어야한다. 속성을 조사해 컬러가 누락된곳을 찾아줘")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { bodyLook, depthMmOf, frameHex, frameLook, frameMmOf, renderSpecOf } from '../../src/lib/core/render';
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
  it('후렉스의 face 는 "배경색"(출력 바탕, 2026-10-21 — 프레임 색과 구분은 그대로), 갈바는 도색(몸통 = 프레임)', () => {
    expect(label(obj({ productId: 'board-flex' }), 'faceSystem')).toBe('배경색');
    expect(label(obj({ productId: 'board-flex' }), 'framePaintSystem')).toBe('프레임 색 (알루미늄)');
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
    expect(renderSpecOf(obj({ productId: 'frame-plain', widthMm: 3000, heightMm: 600 }), place)!.sideColor).toBe('#6b7075');
  });
  it('시트 색이 카드·3D 앞면 글자 색에', () => {
    const sh = newPart('sheet', 'sh-cut'); sh.options = { sheetSystem: '기본색', sheetCode: '빨강' }; sh.items = [{ id: 't', kind: 'text', text: '시트', x: 0, y: 0, h: 200 }];
    const o = obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600, parts: [sh] });
    expect(layoutParts(o, 3000, 600, 300, 60)[0].color).toBe('#d62828');
    expect(renderSpecOf(o, place)!.faceItems![0].color).toBe('#d62828');
  });
});

// 2026-10-17 사용자: "도색을 상황에 따라 포맥스 고무스카시 아크릴에 들어간다"
describe('도색은 포맥스·아크릴 판에도 (상황에 따라, 기본은 도색 없음) — 스카시는 이미 있음', () => {
  it('포맥스·아크릴: 도색(paint) 피커 + 판 색(face). 고무·티타늄·아크릴 스카시: 도색', () => {
    for (const id of ['board-foamex', 'board-acrylic']) {
      expect(has(obj({ productId: id }), 'paintSystem'), id).toBe(true);
      expect(has(obj({ productId: id }), 'faceSystem'), id).toBe(true);
      expect(label(obj({ productId: id }), 'paintSystem')).toBe('도색');
    }
    for (const t of ['ch-rubber', 'sc-titan', 'ch-scashi']) expect(partOptionFields(newPart('scashi', t)).some((f) => f.key === 'paintSystem'), t).toBe(true);
  });
  it('도색을 고르면 판 색보다 우선해 보드·3D 앞면에', () => {
    const o = obj({ productId: 'board-foamex', widthMm: 1000, heightMm: 300, options: { faceSystem: '기본색', faceCode: '흰색', paintSystem: '기본색', paintCode: '빨강' } });
    expect(bodyLook(o)!.color).toBe('#d62828');
    expect(renderSpecOf(o, place)!.faceColor).toBe('#d62828');
    expect(bodyLook(obj({ productId: 'board-acrylic', options: { faceSystem: '기본색', faceCode: '흰색', paintSystem: '도색 없음' } }))!.color).toBe('#f4f4f2');
  });
});

// 2026-10-17 사용자: "3d에서 프레임과 판을 구별하나?"
describe('프레임 테: 판을 테가 둘러싸는 종류는 앞면 가장자리에 프레임 색 테', () => {
  it('후렉스 10(알루미늄 1cm) · 라이트패널 20 · 액자 25 · 갈바/복합판/포맥스 0, 테두리 두께 옵션으로 바꿀 수 있다', () => {
    expect(frameMmOf(obj({ productId: 'board-flex' }))).toBe(10);
    expect(frameMmOf(obj({ productId: 'board-lightpanel', options: { frameWidth: '35' } }))).toBe(35);
    expect(frameMmOf(obj({ productId: 'board-lightpanel', options: { frameWidth: 'x' } }))).toBe(20);
    expect(frameMmOf(obj({ productId: 'board-galva', options: { frameWidth: '35' } }))).toBe(0); // 테 없는 종류는 옵션도 없음
    expect(has(obj({ productId: 'board-flex' }), 'frameWidth')).toBe(true);
    expect(has(obj({ productId: 'board-galva' }), 'frameWidth')).toBe(false);
    expect(frameMmOf(obj({ productId: 'board-lightpanel' }))).toBe(20);
    expect(frameMmOf(obj({ productId: 'frame-plain' }))).toBe(25);
    for (const id of ['board-galva', 'board-acp', 'board-foamex', 'board-acrylic', 'banner']) expect(frameMmOf(obj({ productId: id })), id).toBe(0);
  });
  it('frameLook: 테 있는 종류는 색을 안 골라도 기본 회색 테, 테 없는 종류는 프레임 색을 골랐을 때만', () => {
    expect(frameLook(obj({ productId: 'board-flex' }))).toEqual({ color: '#c8cbcf', mm: 10 }); // 알루미늄
    expect(frameLook(obj({ productId: 'board-flex', options: { framePaintSystem: '기본색', framePaintCode: '검정' } }))).toEqual({ color: '#141414', mm: 10 });
    expect(frameLook(obj({ productId: 'frame-plain' }))).toEqual({ color: '#6b7075', mm: 25 });
    expect(frameLook(obj({ productId: 'board-foamex' }))).toBeNull();
    expect(frameLook(obj({ productId: 'board-galva', options: { paintSystem: '기본색', paintCode: '검정' } }))).toEqual({ color: '#141414', mm: 0 });
  });
  it('renderSpecOf 가 frameMm 을 넘긴다 (몸통 없음은 0)', () => {
    expect(renderSpecOf(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 }), place)!.frameMm).toBe(10);
    expect(renderSpecOf(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 }), place)!.sideColor).toBe('#c8cbcf');
    expect(renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600 }), place)!.frameMm).toBe(0);
  });
});

// 2026-10-18 사용자: "두께가 연동되지 않네" — 상자 가이드 두께 = 입력값 > 종류 기본
describe('depthMmOf', () => {
  it('입력한 두께가 우선, 없으면 종류 기본(후렉스 150, 갈바 100), 시트 2', () => {
    expect(depthMmOf(obj({ productId: 'board-flex', depthMm: 80 }))).toBe(80);
    expect(depthMmOf(obj({ productId: 'board-flex' }))).toBe(150);
    expect(depthMmOf(obj({ productId: 'board-galva' }))).toBe(100);
    expect(depthMmOf(obj({ sheetIds: ['sh-cut'] }))).toBe(2);
  });
});
