// 사인물 카드에 그리는 층 (2026-11-06 사용자 정의: "사인물카드는 실측(사진), 2d(속성내용), 3d(속성내용 3d추가), 디자인(대지 이미지)").
// 보내기 최종 이미지("위의 순서로 최종(3d제외) 이미지로 보낸다")도 같은 규칙 — 디자인이 있으면 대지 이미지, 없으면 2D 속성 내용, 그것도 없으면 사진. → docs/features/design-sync.md
export type CardTab = 'measure' | '2d' | '3d' | 'design' | 'list' | 'final';
export interface CardLayers { photo: boolean; fill: boolean; parts: boolean; design: boolean }

export function cardLayers(tab: CardTab, hasDesign: boolean): CardLayers {
  if (tab === 'measure') return { photo: true, fill: false, parts: false, design: false };
  if ((tab === 'design' || tab === 'final') && hasDesign) return { photo: true, fill: false, parts: false, design: true };
  return { photo: true, fill: true, parts: true, design: false };
}
