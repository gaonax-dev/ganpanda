// 실사 합성 (5차): 사인물 + 벽면 위치 → 시뮬레이터 간판 사양
import { categoryOf, productById, signParts } from './catalog';
import { topLightOf } from './topLight';
import { DEFAULT_LETTER3D, channelHeightOf, lightingOf } from './letter3d';
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
  'board-reface': { faceColor: '#fff8e6', depthMm: 150 }, // 천갈이: 기존 후렉스 간판과 같은 외형
  'board-protrude': { faceColor: '#fff8e6', depthMm: 150 }, // 그린 면(옆에서 보이는 면)에 상자로. 벽에 수직인 돌출 방향 표현은 후속
  'board-lightpanel': { faceColor: '#ffffff', depthMm: 30 },
  'board-fabric': { faceColor: '#ffffff', depthMm: 100 },
  'board-pole': { faceColor: '#3a3f44', depthMm: 300 },
  'board-awning': { faceColor: '#c0392b', depthMm: 800 },
  'board-mirror': { faceColor: '#1d2226', depthMm: 30 },
  'board-ledsign': { faceColor: '#111111', depthMm: 70 },
  'board-air': { faceColor: '#f39c12', depthMm: 500 },
  'board-truss': { faceColor: '#3a3f44', depthMm: 50 },
  'board-pipe': { faceColor: '#3a3f44', depthMm: 80 },
  banner: { faceColor: '#ffffff', depthMm: 2 },
  'frame-plain': { faceColor: '#f4f4f2', depthMm: 30 },
  'frame-wood': { faceColor: '#c8a27a', depthMm: 40 },
  'body-none': { faceColor: '#9aa0a6', depthMm: 20 },
};
const SHEET_LOOK = { faceColor: '#ffffff', depthMm: 2 };
/** 분류 전: 자리만 보이는 회색 판 */
const UNCLASSIFIED_LOOK = { faceColor: '#9aa0a6', depthMm: 20 };

/** 입체 글자가 그린 영역보다 넓으면 영역 폭에 맞게 줄이는 배율 (좁으면 그대로) — 3D 는 사용자가 그린 자리에 맞물린다 */
export const fitScale = (measuredW: number, placementW: number) => (measuredW > placementW && measuredW > 0 ? placementW / measuredW : 1);

/** 사인물을 벽면 위 3D 간판으로. 채널 + 문구 = 입체 글자, 그 외 = 박스(보드) / 얇은 면(시트) / 분류 없음 = 회색 판 */
export function renderSpecOf(o: SignObject, p: Placement): SignSpec | null {
  // 분류가 없어도 자리를 보여 준다 (회색 얇은 판) — 사진마다 그린 사인물이 3D 에서 빠지지 않게 (2026-10-14 사용자: "4개 사진에서 3D 사인물이 1개 사진에서만 나온다")
  const cat = categoryOf(o);
  const { bodyId, channelId, scashiId } = signParts(o); // 간판 = 몸통 + 채널·스카시 옵션
  // 스카시 부착: 비조명 입체 글자, 두께 = 스카시 두께(T = mm) (2026-10-15 사용자: "스카시도 부착된다")
  const scDepth = scashiId ? parseFloat(String(o.options?.scThick ?? '')) || 10 : 0;
  const product = productById(bodyId);
  const l = o.letter3d;
  // 조합형(parts): 입체 글자는 첫 채널(없으면 스카시) 구성 요소의 글자 객체들. 여러 객체 배치는 4단계(정면도 편집기)에서 — 지금은 이어 붙이고 가장 큰 높이
  const lp = o.parts ? o.parts.find((x) => x.kind === 'channel' && x.items.some((i) => i.kind === 'text' && (i.text ?? '').trim())) ?? o.parts.find((x) => x.kind === 'scashi' && x.items.some((i) => i.kind === 'text' && (i.text ?? '').trim())) : undefined;
  const lpTexts = lp ? lp.items.filter((i) => i.kind === 'text' && (i.text ?? '').trim()) : [];
  const partH = lpTexts.length ? Math.max(...lpTexts.map((i) => i.h)) : 0;
  const text = o.parts ? lpTexts.map((i) => (i.text ?? '').trim()).join(' ') : (o.text ?? '').trim();
  // 상단 조명 (2026-10-16): 개수는 입력 가로(없으면 3D 배치 가로)로
  const tl = topLightOf(o, p.w);
  const base = { id: o.id, text, x: p.cx, y: p.cy, letterSpacing: l?.letterSpacing ?? DEFAULT_LETTER3D.letterSpacing, textColor: '#111111', ...(tl ? { topLight: { kind: tl.kind, count: tl.count, armMm: tl.armMm, color: tl.color } } : {}) };
  const d = { ...DEFAULT_LETTER3D, ...(l ?? {}) };
  // 몸통 없음 + 채널 + 문구 = 입체 글자만 (글자 높이 = 그린 영역 세로)
  if (bodyId === 'body-none' && channelId && text) {
    return { ...base, kind: 'channel', heightMm: p.h, widthMm: p.w, depthMm: d.depthMm, lighting: lightingOf(channelId), faceColor: d.faceColor, sideColor: d.sideColor };
  }
  if (bodyId === 'body-none' && scashiId && text) {
    return { ...base, kind: 'channel', heightMm: p.h, widthMm: p.w, depthMm: scDepth, lighting: 'none', faceColor: d.faceColor, sideColor: d.sideColor };
  }
  const look = product ? (BOARD_LOOK[product.id] ?? { faceColor: DEFAULT_LETTER3D.faceColor, depthMm: 100 }) : cat === 'sheet' ? SHEET_LOOK : UNCLASSIFIED_LOOK;
  // 몸통 + 채널 + 문구 = 상자 위에 입체 글자. 글자 높이는 옵션(없으면 영역 세로의 60%)
  const fromParts = (h: number) => (h && o.heightMm ? Math.min(p.h * 0.9, (h / o.heightMm) * p.h) : p.h * 0.6);
  const letters = o.parts && lp && text ? { text, heightMm: fromParts(partH), depthMm: lp.kind === 'scashi' ? parseFloat(String(lp.options?.thickness ?? '')) || 10 : d.depthMm, lighting: lp.kind === 'scashi' ? 'none' as const : lightingOf(lp.type), faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing }
    : channelId && text ? { text, heightMm: Number(o.options?.chHeight) || (channelHeightOf(o) && o.heightMm ? Math.min(p.h * 0.6, (channelHeightOf(o)! / o.heightMm) * p.h) : p.h * 0.6), depthMm: d.depthMm, lighting: lightingOf(channelId), faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing }
    : scashiId && text ? { text, heightMm: Number(o.options?.scHeight) && o.heightMm ? Math.min(p.h * 0.9, (Number(o.options?.scHeight) / o.heightMm) * p.h) : p.h * 0.6, depthMm: scDepth, lighting: 'none' as const, faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing } : undefined;
  return {
    ...base, kind: 'lightbox', widthMm: p.w, heightMm: p.h, corner: o.shape === 'ellipse' ? 0.5 : o.corner,
    depthMm: o.depthMm ?? l?.depthMm ?? look.depthMm, // 입력한 두께 > 입체 설정 > 종류 기본
    // 내부 조명 옵션이 '비조명'이면 빛나지 않는다 (2026-10-16, 상단 조명은 주로 비조명 간판에)
    lighting: ['board-flex', 'board-reface', 'board-protrude', 'board-lightpanel', 'board-fabric'].includes(bodyId ?? '') && o.options?.light !== '비조명' ? 'front' : 'none',
    faceColor: letters ? look.faceColor : l?.faceColor ?? look.faceColor, // 글자가 있으면 입체 색은 글자 것
    sideColor: letters ? '#6b7075' : l?.sideColor ?? '#6b7075',
    ...(letters ? { letters, text: '' } : {}), // 글자는 입체로 얹으므로 면 글자는 비움
  };
}

/** 사인물 두께(mm): 입력 두께 > 입체 설정 > 종류 기본. 시트·분류 없음은 0 — 상자 가이드는 두께가 있는 것만 (2026-10-15) */
export function thicknessOf(o: SignObject): number {
  const { bodyId, channelId } = signParts(o);
  const product = productById(bodyId);
  if (!product && !channelId) return 0;
  if (o.depthMm) return o.depthMm;
  if (channelId && (!product || bodyId === 'body-none')) return o.letter3d?.depthMm ?? DEFAULT_LETTER3D.depthMm;
  return o.letter3d?.depthMm ?? BOARD_LOOK[product!.id]?.depthMm ?? 100;
}
