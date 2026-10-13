// 디자인 소스 매핑 (3차): 소스 페이지의 잘라낼 영역, 변경 이력, 파일 종류
export interface Crop { x: number; y: number; w: number; h: number }
/** 사인물에 입힌 디자인: 어느 소스의 몇 번째 페이지, 어느 영역(페이지 px) */
export interface DesignRef { sourceId: string; page: number; crop: Crop }
export interface DesignHistoryEntry extends DesignRef { at: number; author: string }

export const CROP_MIN = 8;
export const HISTORY_MAX = 20;

/** 드래그로 만든 영역을 페이지 안으로 자르고 뒤집힌 좌표를 바로잡는다. 너무 작으면 null */
export function normalizeCrop(c: Crop, page: { w: number; h: number }): Crop | null {
  let x0 = Math.min(c.x, c.x + c.w), x1 = Math.max(c.x, c.x + c.w);
  let y0 = Math.min(c.y, c.y + c.h), y1 = Math.max(c.y, c.y + c.h);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(page.w, x1); y1 = Math.min(page.h, y1);
  const out = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  return out.w < CROP_MIN || out.h < CROP_MIN ? null : out;
}

const sameRef = (a: DesignRef, b: DesignRef) =>
  a.sourceId === b.sourceId && a.page === b.page && a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.w === b.crop.w && a.crop.h === b.crop.h;

/** 이력 앞에 추가 (최신이 앞). 직전과 같으면 추가하지 않고, 최대 HISTORY_MAX 개 */
export function pushHistory(history: DesignHistoryEntry[], ref: DesignRef, meta: { at: number; author: string }): DesignHistoryEntry[] {
  if (history[0] && sameRef(history[0], ref)) return history;
  return [{ ...ref, crop: { ...ref.crop }, ...meta }, ...history].slice(0, HISTORY_MAX);
}

export type SourceKind = 'pdf' | 'svg' | 'bitmap';

/** 파일 종류: .ai·.pdf 는 PDF 로 읽는다 (일러스트레이터 "PDF 호환" 저장) */
export function sourceKind(name: string, mime: string): SourceKind | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ai' || ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'svg' || mime === 'image/svg+xml') return 'svg';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'bitmap';
  return null;
}
