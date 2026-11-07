// 사인물 카드 = 실측(사진) · 2D(속성 내용) · 3D(속성 내용, 3D 추가) · 디자인(대지 이미지) (2026-11-06 사용자 정의)
import { describe, expect, it } from 'vitest';
import { cardLayers } from '../../src/lib/core/cardLayers';

describe('cardLayers — 탭마다 카드에 그리는 층', () => {
  it('실측 = 사진만', () => expect(cardLayers('measure', true)).toEqual({ photo: true, fill: false, parts: false, design: false }));
  it('2D·3D = 사진 위 속성 내용(바탕색·구성 요소), 디자인은 안 그림', () => {
    for (const t of ['propose'] as const) expect(cardLayers(t, true)).toEqual({ photo: true, fill: true, parts: true, design: false });
  });
  it('디자인 = 대지 이미지(디자인)만, 없으면 2D 내용', () => {
    expect(cardLayers('design', true)).toEqual({ photo: true, fill: false, parts: false, design: true });
    expect(cardLayers('design', false)).toEqual({ photo: true, fill: true, parts: true, design: false });
  });
  it('보내기 최종 이미지 = 디자인 탭 카드와 같다 (3D 제외 마지막 단계)', () => {
    expect(cardLayers('final', true)).toEqual(cardLayers('design', true));
    expect(cardLayers('final', false)).toEqual(cardLayers('propose', false));
  });
});

// 2026-11-07 사용자: "2d, 3d는 디자인이 적용되기 전의 임시 설정으로 사인물카드를 보여줘야한다. 이건 일종의 약속과 같은거여서" · "3d에서 랜더링 이미지가 사인물카드에 표시되는건 잘못된 방식이다"
describe('cardLayers — 2D·3D 는 임시 설정(디자인 없음), 디자인 탭만 디자인', () => {
  it('디자인이 있어도 2D·3D 카드는 속성 내용, 디자인 탭은 전체 디자인', () => {
    for (const t of ['propose'] as const) expect(cardLayers(t, true)).toEqual({ photo: true, fill: true, parts: true, design: false });
    expect(cardLayers('design', true)).toEqual({ photo: true, fill: false, parts: false, design: true });
  });
});

// 2026-11-08 "2d,3d를 하나로 통합한다. 그리고 제안이다. 실측, 제안, 견적, 디자인 + 완료된 결과물 올리는 사진보드"
describe('cardLayers — 제안·완료 탭', () => {
  it('제안 = 임시 설정(디자인 없음)', () => expect(cardLayers('propose', true)).toEqual({ photo: true, fill: true, parts: true, design: false }));
  it('완료 = 디자인 탭과 같다', () => {
    expect(cardLayers('done', true)).toEqual(cardLayers('design', true));
    expect(cardLayers('done', false)).toEqual(cardLayers('design', false));
  });
});
