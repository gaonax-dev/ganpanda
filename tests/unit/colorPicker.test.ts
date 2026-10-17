// 컬러 피커 (2026-10-17 사용자: "후랙스 갈바 모두 컬러피커로 색상지정할 수 있게해줘 컬러가 필요한 곳에 컬러피커 간단모드와 확장모드")
import { describe, expect, it } from 'vitest';
import type { SignObject } from '../../src/lib/core/model';
import { PAINT_SYSTEMS, paintHex, paintLabel } from '../../src/lib/core/materials';
import { optionGroupsFor, partOptionFields } from '../../src/lib/core/options';
import { renderSpecOf } from '../../src/lib/core/render';
import { newPart } from '../../src/lib/core/parts';
import { quickSpecOf } from '../../src/lib/core/quickSpec';

const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'A', shape: 'rect', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], sheetIds: [], createdAt: 0, ...o });
const place = { cx: 0, cy: 0, w: 3000, h: 600 };

describe('도색 객체: 직접 지정(hex) 체계와 색 읽기', () => {
  it('체계: 도색 없음 / 기본색 / 직접 / PANTONE / RAL / KCC', () => {
    expect(PAINT_SYSTEMS).toEqual(['도색 없음', '기본색', '직접', 'PANTONE', 'RAL', 'KCC']);
  });
  it('paintHex: 기본색은 이름 → hex, 직접은 hex 그대로, 코드 체계·없음은 null', () => {
    expect(paintHex({ paintSystem: '기본색', paintCode: '갈색' }, 'paint')).toMatch(/^#[0-9a-f]{6}$/);
    expect(paintHex({ paintSystem: '직접', paintCode: '#12AB34' }, 'paint')).toBe('#12ab34');
    expect(paintHex({ paintSystem: 'RAL', paintCode: '9005' }, 'paint')).toBeNull();
    expect(paintHex({ paintSystem: '도색 없음' }, 'paint')).toBeNull();
    expect(paintHex({ paintSystem: '직접', paintCode: 'zzz' }, 'paint')).toBeNull();
  });
  it('paintLabel: 읽는 말 — 색 이름 / #hex / "RAL 9005"', () => {
    expect(paintLabel({ paintSystem: '기본색', paintCode: '흰색' }, 'paint')).toBe('흰색');
    expect(paintLabel({ paintSystem: '직접', paintCode: '#12ab34' }, 'paint')).toBe('#12ab34');
    expect(paintLabel({ paintSystem: 'RAL', paintCode: '9005' }, 'paint')).toBe('RAL 9005');
    expect(paintLabel({}, 'paint')).toBeNull();
  });
});

describe('색이 필요한 곳마다 도색 객체(컬러 피커): 후렉스·천갈이 바탕색', () => {
  it('후렉스에 바탕색(face) 도색 객체가 있고, 필드에 paint 표시(간단/확장 피커로 그린다)', () => {
    const fields = optionGroupsFor(obj({ productId: 'board-flex' })).flatMap((g) => g.fields);
    const sys = fields.find((f) => f.key === 'faceSystem')!;
    expect(sys).toBeTruthy();
    expect(sys.paint).toEqual({ prefix: 'face', part: 'system', label: '바탕색' });
    expect(optionGroupsFor(obj({ productId: 'board-reface' })).flatMap((g) => g.fields).some((f) => f.key === 'faceSystem')).toBe(true);
    const galva = optionGroupsFor(obj({ productId: 'board-galva', options: { paintSystem: '직접' } })).flatMap((g) => g.fields);
    expect(galva.find((f) => f.key === 'paintSystem')!.paint).toMatchObject({ prefix: 'paint', part: 'system' });
    expect(galva.find((f) => f.key === 'paintCode')!.paint).toMatchObject({ prefix: 'paint', part: 'code' });
    expect(galva.find((f) => f.key === 'paintGloss')!.paint).toMatchObject({ prefix: 'paint', part: 'gloss' });
    expect(partOptionFields(newPart('channel', 'ch-front')).find((f) => f.key === 'bodySystem')!.paint).toMatchObject({ prefix: 'body' });
  });
});

describe('고른 색이 3D·실사에 반영된다', () => {
  it('후렉스 바탕색 노랑 → 상자 앞면 색, 갈바 도색 직접 #112233 → 앞면 색', () => {
    const flex = renderSpecOf(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600, options: { faceSystem: '기본색', faceCode: '노랑' } }), place)!;
    expect(flex.faceColor).toBe(paintHex({ faceSystem: '기본색', faceCode: '노랑' }, 'face'));
    const galva = renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, options: { paintSystem: '직접', paintCode: '#112233' } }), place)!;
    expect(galva.faceColor).toBe('#112233');
    const plain = renderSpecOf(obj({ productId: 'board-flex', widthMm: 3000, heightMm: 600 }), place)!;
    expect(plain.faceColor).toBe('#fff8e6'); // 기본 겉모습
  });
  it('조합형(구성 요소 있음)에서도 몸통 색이 상자에', () => {
    const ch = newPart('channel', 'ch-front'); ch.items = [{ id: 't', kind: 'text', text: '간판', x: 0, y: 0, h: 300 }];
    const s = renderSpecOf(obj({ productId: 'board-galva', widthMm: 3000, heightMm: 600, options: { paintSystem: '기본색', paintCode: '검정' }, parts: [ch] }), place)!;
    expect(s.faceColor).toBe(paintHex({ paintSystem: '기본색', paintCode: '검정' }, 'paint'));
  });
  it('칩 문구: 후렉스 바탕색도 몸통 색으로, 직접 지정은 #hex', () => {
    expect(quickSpecOf(obj({ productId: 'board-flex', options: { faceSystem: '기본색', faceCode: '노랑' } })).body).toMatchObject({ name: '후렉스', color: '노랑', paintKey: 'face' });
    expect(quickSpecOf(obj({ productId: 'board-galva', options: { paintSystem: '직접', paintCode: '#112233' } })).body.color).toBe('#112233');
  });
});
