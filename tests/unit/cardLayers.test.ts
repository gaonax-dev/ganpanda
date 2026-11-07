// 사인물 카드 = 실측(사진) · 2D(속성 내용) · 3D(속성 내용, 3D 추가) · 디자인(대지 이미지) (2026-11-06 사용자 정의)
import { describe, expect, it } from 'vitest';
import { cardLayers } from '../../src/lib/core/cardLayers';

describe('cardLayers — 탭마다 카드에 그리는 층', () => {
  it('실측 = 사진만', () => expect(cardLayers('measure', true)).toEqual({ photo: true, fill: false, parts: false, design: false }));
  it('2D·3D = 사진 위 속성 내용(바탕색·구성 요소), 디자인은 안 그림', () => {
    for (const t of ['2d', '3d'] as const) expect(cardLayers(t, true)).toEqual({ photo: true, fill: true, parts: true, design: false });
  });
  it('디자인 탭 카드는 3D 그림이 있어도 전체 디자인 (2026-11-07 "사인물 카드는 전체 디자인이 나와야해")', () => {
    expect(cardLayers('design', true, { has3d: true })).toEqual({ photo: true, fill: false, parts: false, design: true });
    expect(cardLayers('final', true, { has3d: true })).toEqual({ photo: true, fill: false, parts: false, design: true }); // 보내기 최종 이미지는 대지 이미지
  });
  it('디자인 = 대지 이미지(디자인)만, 없으면 2D 내용', () => {
    expect(cardLayers('design', true)).toEqual({ photo: true, fill: false, parts: false, design: true });
    expect(cardLayers('design', false)).toEqual({ photo: true, fill: true, parts: true, design: false });
  });
  it('보내기 최종 이미지 = 디자인 탭 카드와 같다 (3D 제외 마지막 단계)', () => {
    expect(cardLayers('final', true)).toEqual(cardLayers('design', true));
    expect(cardLayers('final', false)).toEqual(cardLayers('2d', false));
  });
});

// 2026-11-07 사용자: "핀볼에서 모든 모드 확인해줘 사이물 카드가 모드 변화에 이미지 교체가 안된다"
describe('cardLayers — 3D 카드·디자인이 면인 시트', () => {
  it('3D = 3D 합성 그림에서 편 사인물 자리(있으면 2D 바탕·구성 요소는 그리지 않음), 없으면 2D 내용', () => {
    expect(cardLayers('3d', false, { has3d: true })).toEqual({ photo: true, fill: false, parts: false, design: false, d3: true });
    expect(cardLayers('3d', false, { has3d: false })).toEqual({ photo: true, fill: true, parts: true, design: false });
  });
  it('디자인이 면인 시트(바탕 위 면 시트 + 디자인)는 2D·3D 카드에도 디자인 — 사진만 남아 실측과 같아 보이던 것', () => {
    expect(cardLayers('2d', true, { designIsFace: true })).toEqual({ photo: true, fill: true, parts: true, design: true });
    expect(cardLayers('2d', true)).toEqual({ photo: true, fill: true, parts: true, design: false });
    expect(cardLayers('measure', true, { designIsFace: true, has3d: true })).toEqual({ photo: true, fill: false, parts: false, design: false });
  });
});
