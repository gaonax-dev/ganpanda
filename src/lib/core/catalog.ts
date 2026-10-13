// 간판·시트 종류와 단가 (예시값 — 업체 단가표로 교체)
export type Category = 'board' | 'channel';
export type Pricing = { type: 'area'; perM2: number } | { type: 'char'; perCharPerCm: number };

export interface Product { id: string; category: Category; name: string; pricing: Pricing }
export interface Sheet { id: string; name: string; pricing: { type: 'area'; perM2: number } }

const area = (perM2: number) => ({ type: 'area' as const, perM2 });
const char = (perCharPerCm: number) => ({ type: 'char' as const, perCharPerCm });

export const CATALOG: Product[] = [
  { id: 'board-foamex', category: 'board', name: '포맥스 보드', pricing: area(45000) },
  { id: 'board-acp', category: 'board', name: '알루미늄 복합판', pricing: area(85000) },
  { id: 'board-acrylic', category: 'board', name: '아크릴 판', pricing: area(120000) },
  { id: 'board-galva', category: 'board', name: '갈바 판', pricing: area(70000) },
  { id: 'board-flex', category: 'board', name: '플렉스 (내부 조명)', pricing: area(250000) },
  { id: 'ch-front', category: 'channel', name: '전광 채널', pricing: char(3200) },
  { id: 'ch-halo', category: 'channel', name: '후광 채널', pricing: char(3800) },
  { id: 'ch-galva', category: 'channel', name: '갈바 에폭시 채널', pricing: char(2600) },
  { id: 'ch-scashi', category: 'channel', name: '스카시 (포맥스/아크릴)', pricing: char(1200) },
  { id: 'ch-rubber', category: 'channel', name: '고무 스카시', pricing: char(900) },
];

export const SHEETS: Sheet[] = [
  { id: 'sh-cut', name: '컬러 시트 커팅', pricing: area(35000) },
  { id: 'sh-print', name: '실사 출력 시트', pricing: area(30000) },
  { id: 'sh-reflect', name: '반사 시트', pricing: area(55000) },
  { id: 'sh-frost', name: '안개(에칭) 시트', pricing: area(40000) },
  { id: 'sh-trans', name: '투명·반투명 시트', pricing: area(38000) },
  { id: 'sh-perf', name: '타공(원웨이) 시트', pricing: area(45000) },
];

export const productById = (id?: string) => CATALOG.find((p) => p.id === id);
export const sheetById = (id: string) => SHEETS.find((s) => s.id === id);
export const CATEGORY_LABEL: Record<Category, string> = { board: '보드', channel: '채널' };
