// 재질 객체 · 도색 객체 (2026-10-16 사용자: "재질객체에 스텐, 철, 알루미늄 여기에 도색 객체를 추가해 사용한다. 체널, 스카시, 도색이 필요한 곳에 도색 객체를 넣는다.
// 체널 전광의 경우 pc판도 선택할 수 있다. 조합 가능한 건 객체를 구성하고 추후 제공되는 자제를 공급업체별로 구성하려한다.")
// 옵션 값은 사람이 읽는 이름(label)으로 저장하고, 여기 id 는 나중에 공급업체 자재(품목 코드·단가)를 붙일 자리다.

export interface Material { id: string; label: string; paintable: boolean }
/** 프레임·측면 등에 쓰는 재질 */
export const MATERIALS: Material[] = [
  { id: 'stain', label: '스텐', paintable: true },
  { id: 'iron', label: '철', paintable: true },
  { id: 'alu', label: '알루미늄', paintable: true },
  { id: 'galva', label: '갈바', paintable: true },
  { id: 'tension', label: '텐션 천', paintable: false },
];
/** 채널 앞면 판 (전광·전후광): 아크릴 / PC판 */
export const FACE_MATERIALS: Material[] = [
  { id: 'acrylic', label: '아크릴', paintable: false },
  { id: 'pc', label: 'PC판', paintable: false },
];
export const materialById = (id: string) => [...MATERIALS, ...FACE_MATERIALS].find((m) => m.id === id);
export const materialByLabel = (label: unknown) => [...MATERIALS, ...FACE_MATERIALS].find((m) => m.label === label);
/** 재질 id 목록 → 이름 목록 (옵션 값) */
export const labelsOf = (ids: string[]) => ids.map((id) => materialById(id)!.label);

/** 도색 객체: 색상 체계(도색 없음이 기본) + 컬러코드 + 광택. 기본색 = 색 이름으로 바로 (2026-10-17 빠른 설정 "갈바 흰색 / 채널 갈색") */
export const PAINT_SYSTEMS = ['도색 없음', '기본색', 'PANTONE', 'RAL', 'KCC'];
/** 기본색: 이름 + 3D 에 쓰는 색 */
export const NAMED_COLORS: { label: string; hex: string }[] = [
  { label: '흰색', hex: '#f4f4f2' }, { label: '검정', hex: '#141414' }, { label: '회색', hex: '#8a8f94' }, { label: '진회색', hex: '#3a3f44' },
  { label: '갈색', hex: '#6b4423' }, { label: '빨강', hex: '#d62828' }, { label: '파랑', hex: '#1f5fbf' }, { label: '노랑', hex: '#ffcc00' },
  { label: '초록', hex: '#2e8b57' }, { label: '금색', hex: '#c9a227' }, { label: '은색', hex: '#d8dadd' },
];
export const colorHex = (label: unknown): string | null => NAMED_COLORS.find((c) => c.label === label)?.hex ?? null;
export const GLOSSES = ['유광', '반광', '무광'];
