// 실사 합성 (5차): 사인물 + 벽면 위치 → 시뮬레이터 간판 사양
import { categoryOf, productById } from './catalog';
import { DEFAULT_LETTER3D, lightingOf } from './letter3d';
import type { SignObject } from './model';
import type { Placement } from './wallPlane';
import type { SignSpec } from '../sim/types';

/** 보드 제품별 기본 겉모습: 바탕색 · 두께(mm) */
const BOARD_LOOK: Record<string, { faceColor: string; depthMm: number }> = {
  'board-foamex': { faceColor: '#f4f4f2', depthMm: 10 },
  'board-acp': { faceColor: '#2b2f33', depthMm: 100 },
  'board-acrylic': { faceColor: '#f8fafc', depthMm: 100 },
  'board-galva': { faceColor: '#3a3f44', depthMm: 100 },
  'board-flex': { faceColor: '#fff8e6', depthMm: 150 },
};
const SHEET_LOOK = { faceColor: '#ffffff', depthMm: 2 };

/** 사인물을 벽면 위 3D 간판으로. 채널 + 문구 = 입체 글자, 그 외 = 박스(보드) / 얇은 면(시트). 분류 없으면 null */
export function renderSpecOf(o: SignObject, p: Placement): SignSpec | null {
  const cat = categoryOf(o);
  if (!cat) return null;
  const product = productById(o.productId);
  const l = o.letter3d;
  const text = (o.text ?? '').trim();
  const base = { id: o.id, text, x: p.cx, y: p.cy, letterSpacing: l?.letterSpacing ?? DEFAULT_LETTER3D.letterSpacing, textColor: '#111111' };
  if (product?.category === 'channel' && text) {
    const d = { ...DEFAULT_LETTER3D, ...(l ?? {}) };
    return { ...base, kind: 'channel', heightMm: p.h, widthMm: p.w, depthMm: d.depthMm, lighting: lightingOf(o.productId), faceColor: d.faceColor, sideColor: d.sideColor };
  }
  const look = product ? (BOARD_LOOK[product.id] ?? { faceColor: DEFAULT_LETTER3D.faceColor, depthMm: 100 }) : SHEET_LOOK;
  return {
    ...base, kind: 'lightbox', widthMm: p.w, heightMm: p.h, corner: o.shape === 'ellipse' ? 0.5 : o.corner,
    depthMm: l?.depthMm ?? look.depthMm,
    lighting: o.productId === 'board-flex' ? 'front' : 'none',
    faceColor: l?.faceColor ?? look.faceColor,
    sideColor: l?.sideColor ?? '#6b7075',
  };
}
