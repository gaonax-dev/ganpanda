// 사인물 카드에 그리는 층 (2026-11-06 사용자 정의: "사인물카드는 실측(사진), 2d(속성내용), 3d(속성내용 3d추가), 디자인(대지 이미지)").
// 보내기 최종 이미지("위의 순서로 최종(3d제외) 이미지로 보낸다")도 같은 규칙 — 디자인이 있으면 대지 이미지, 없으면 2D 속성 내용, 그것도 없으면 사진. → docs/features/design-sync.md
export type CardTab = 'measure' | '2d' | '3d' | 'design' | 'list' | 'final';
export interface CardLayers { photo: boolean; fill: boolean; parts: boolean; design: boolean; /** 3D 합성 그림에서 편 사인물 자리 (2026-11-07) */ d3?: boolean }

/**
 * opts.has3d = 그 사진의 3D 합성 그림이 있음 — 3D 탭 카드는 그 그림에서 사인물 자리를 편 것("3d(속성내용 3d추가)")
 * opts.designIsFace = 바탕 위 면 시트 + 디자인 — 시트는 디자인을 따르므로 2D·3D 카드에도 디자인 (2026-11-07 "사이물 카드가 모드 변화에 이미지 교체가 안된다")
 */
export function cardLayers(tab: CardTab, hasDesign: boolean, opts: { has3d?: boolean; designIsFace?: boolean } = {}): CardLayers {
  if (tab === 'measure') return { photo: true, fill: false, parts: false, design: false };
  // 디자인 탭 카드는 전체 디자인 (2026-11-07 "사인물 카드는 전체 디자인이 나와야해" — 앞서 3D 그림을 유지하던 것은 대체됨, 3D 그림 유지는 사진보드에서)
  if ((tab === 'design' || tab === 'final') && hasDesign) return { photo: true, fill: false, parts: false, design: true };
  if (tab === '3d' && opts.has3d) return { photo: true, fill: false, parts: false, design: false, d3: true };
  return { photo: true, fill: true, parts: true, design: hasDesign && !!opts.designIsFace };
}
