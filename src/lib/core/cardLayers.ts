// 사인물 카드에 그리는 층 (2026-11-06 사용자 정의: "사인물카드는 실측(사진), 2d(속성내용), 3d(속성내용 3d추가), 디자인(대지 이미지)").
// 보내기 최종 이미지("위의 순서로 최종(3d제외) 이미지로 보낸다")도 같은 규칙 — 디자인이 있으면 대지 이미지, 없으면 2D 속성 내용, 그것도 없으면 사진. → docs/features/design-sync.md
export type CardTab = 'measure' | 'propose' | 'design' | 'list' | 'done' | 'final';
export interface CardLayers { photo: boolean; fill: boolean; parts: boolean; design: boolean }

/**
 * 실측 = 사진 · 제안(예전 2D·3D, 2026-11-08 통합) = 디자인 적용 전 임시 설정(속성 내용 — 그리는 쪽이 디자인을 뗀 사본으로) · 디자인 = 전체 디자인(없으면 임시 설정)
 * (2026-11-07 "2d, 3d는 디자인이 적용되기 전의 임시 설정으로 사인물카드를 보여줘야한다. 이건 일종의 약속과 같은거여서" · "3d에서 랜더링 이미지가 사인물카드에 표시되는건 잘못된 방식이다"
 *  — 잠깐 쓴 3D 카드(렌더링 그림)·디자인이 면인 시트 카드는 대체됨).  보내기 최종 이미지('final')·완료 탭은 디자인 탭 카드와 같다
 */
export function cardLayers(tab: CardTab, hasDesign: boolean): CardLayers {
  if (tab === 'measure') return { photo: true, fill: false, parts: false, design: false };
  if ((tab === 'design' || tab === 'final' || tab === 'done') && hasDesign) return { photo: true, fill: false, parts: false, design: true };
  return { photo: true, fill: true, parts: true, design: false };
}
