// 실사 합성 (5차): 사인물 + 벽면 위치 → 시뮬레이터 간판 사양
import { hasPartsToDraw, withSheetAreas } from './sheetArea';
import { SCASHI_OPTIONS, categoryOf, isChannelProduct, productById, signParts } from './catalog';
import { itemBox } from './frontView';
import { componentOf, surfaceOf } from './components';
import { paintAlpha, paintHex } from './materials';
import { lightOf, partsOf , drawnParts } from './parts';
import { layersOf, placedItems } from './layers';
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
/** 사인물 두께(mm): 입력값 > 종류 기본 (상자 가이드·3D 공용 — 2026-10-18 "두께가 연동되지 않네": 가이드가 가로·세로의 작은 쪽을 두께로 쓰고 있었다) */
export function depthMmOf(o: SignObject): number {
  if (o.depthMm) return o.depthMm;
  const id = signParts(o).bodyId ?? '';
  return BOARD_LOOK[id]?.depthMm ?? (categoryOf(o) === 'sheet' ? SHEET_LOOK.depthMm : 100);
}
/** 분류 전: 자리만 보이는 회색 판 */
const UNCLASSIFIED_LOOK = { faceColor: '#9aa0a6', depthMm: 20 };

/** 입체 글자가 그린 영역보다 넓으면 영역 폭에 맞게 줄이는 배율 (좁으면 그대로) — 3D 는 사용자가 그린 자리에 맞물린다 */
export const fitScale = (measuredW: number, placementW: number) => (measuredW > placementW && measuredW > 0 ? placementW / measuredW : 1);

const SCASHI_IDS = new Set(SCASHI_OPTIONS.map((c) => c.id));
/** 내부 조명이 켜진 몸통: 후렉스류는 '비조명'이 아니면, 갈바는 내부 조명 LED(레이저 타공, 2026-10-17)일 때 */
const isLitBody = (bodyId: string | undefined, o: SignObject) => partsOf(o).some((p) => componentOf(p.kind).litsBody) || // LED 모듈이 있으면 (2026-10-19)
  (['board-flex', 'board-reface', 'board-protrude', 'board-lightpanel', 'board-fabric'].includes(bodyId ?? '') && o.options?.light !== '비조명') || (bodyId === 'board-galva' && o.options?.light === 'LED');
/** 몸통 색: 도색(갈바 등) > 바탕색(후렉스 등) > 프레임 도색 — 기본색·직접 지정일 때만 hex */
/** 몸통 앞면 색: 도색(갈바·복합판) > 출력면·바탕색. 프레임 색은 앞면에 쓰지 않는다 (2026-10-17 "프레임과 구분") */
const bodyPaintHex = (o: SignObject) => paintHex(o.options, 'paint') ?? paintHex(o.options, 'face');
/** 프레임(상자 옆면·테) 색: 프레임 도색 > 몸통 도색(갈바는 몸통이 곧 프레임). 없으면 null → 기본 회색 */
export const frameHex = (o: SignObject) => paintHex(o.options, 'framePaint') ?? paintHex(o.options, 'paint');
const FRAME_DEFAULT = '#6b7075';
/** 앞에서 보이는 프레임 테 폭(mm): 판(출력면)을 테가 둘러싸는 종류만. 갈바·복합판·포맥스·아크릴·현수막은 판이 곧 앞면이라 0 (2026-10-17 "3d에서 프레임과 판을 구별하나?") */
// 후렉스 프레임은 알루미늄, 정면에서 보이는 두께 1cm (2026-10-17 사용자). 라이트박스류는 옵션 `frameWidth`(테두리 두께 mm)로 따로 지정할 수 있다
export const FRAME_MM: Record<string, number> = { 'board-flex': 10, 'board-reface': 10, 'board-lightpanel': 20, 'board-fabric': 25, 'frame-plain': 25, 'frame-wood': 40, 'board-mirror': 20, 'board-ledsign': 30, 'board-pole': 40 };
/** 알루미늄 프레임 종류의 기본 테 색 (프레임 색을 안 골랐을 때) */
const ALU = '#c8cbcf';
const FRAME_COLOR_DEFAULT: Record<string, string> = { 'board-flex': ALU, 'board-reface': ALU, 'board-lightpanel': ALU, 'board-fabric': ALU };
export function frameMmOf(o: SignObject): number {
  const bodyId = signParts(o).bodyId ?? '';
  const base = FRAME_MM[bodyId] ?? 0;
  if (!base) return 0;
  const own = Number(o.options?.frameWidth);
  return Number.isFinite(own) && own > 0 ? own : base;
}
const frameDefaultColor = (o: SignObject) => FRAME_COLOR_DEFAULT[signParts(o).bodyId ?? ''] ?? FRAME_DEFAULT;
/** 프레임 표시: 테가 있는 종류는 색(고른 색 또는 기본 회색)과 폭, 테 없는 종류는 프레임 색을 골랐을 때만 (옆면·카드 테두리용) */
export function frameLook(o: SignObject): { color: string; mm: number } | null {
  const mm = frameMmOf(o);
  const hex = frameHex(o);
  if (mm > 0) return { color: hex ?? frameDefaultColor(o), mm };
  return hex ? { color: hex, mm: 0 } : null;
}
/** 2D 보드에 그리는 바탕: 색(고른 색 > 종류 기본 겉모습) + 불투명도(고른 도색의 투명도). 종류가 없으면 null (시트 분류·분류 없음) — 2026-10-17 "사인물 바탕색 원본에 보이게" */
export function bodyLook(o: SignObject): { color: string; opacity: number } | null {
  const product = productById(signParts(o).bodyId);
  if (!product || product.id === 'body-none') return null;
  const base = BOARD_LOOK[product.id]?.faceColor ?? DEFAULT_LETTER3D.faceColor;
  const key = o.options?.paintSystem ? 'paint' : 'face';
  return { color: bodyPaintHex(o) ?? base, opacity: paintAlpha(o.options, key) };
}
const hasText = (t?: string) => !!(t ?? '').trim();

/**
 * 조합형 4단계 (2026-10-16 사용자: "4단계 진행해"): 구성 요소의 객체를 정면도 위치 그대로 — 사인물 mm 를 그린 자리(p) 비율로 줄여서.
 * 채널·스카시 글자 = 입체 글자(구성 요소별 두께·조명), 그림·시트 글자 = 앞면에 평면으로
 */
function composedOf(o: SignObject, p: Placement, d: typeof DEFAULT_LETTER3D, letterSpacing: number, est?: { w: number; h: number }): Pick<SignSpec, 'letterItems' | 'faceItems'> {
  // 치수가 없으면 추정 치수로 글자·면 축척 (2026-10-22 "3d에서 … 비정상적으로 커지는거") — 없으면 그린 자리 그대로
  const sx = p.w / (o.widthMm || est?.w || p.w), sy = p.h / (o.heightMm || est?.h || p.h);
  const letterItems: NonNullable<SignSpec['letterItems']> = [];
  const faceItems: NonNullable<SignSpec['faceItems']> = [];
  // 레이어 트리를 걸으며 깊이 누적 (2단계): 채널 앞면 위 시트의 글자·그림은 채널 두께만큼 앞에, 시트 위 시트는 그대로. 그룹은 오프셋만
  const placed = placedItems(layersOf(o, drawnParts(o, partsOf(o))), (part) => componentOf(part.kind).depthMm(part, o)); // 디자인 파일이 있으면 미리보기 글자·그림은 뺌 (2026-10-21)
  for (const { item: it, part, z } of placed) {
    if (it.kind === 'text' && !hasText(it.text)) continue;
    const c = componentOf(part.kind); // 종류 모듈: 밀어내기 여부·두께·조명·도색 키 (0단계)
    const zMm = z * Math.min(sx, sy);
    if (it.kind === 'text' && c.extrude) {
      const b = itemBox(it); // 글자 상자 (가로 없으면 글자수 × 높이 × 0.9) — 3D 글자도 이 상자에 맞춘다 (2026-10-18)
      letterItems.push({
        partId: part.id, text: it.text!.trim(), heightMm: it.h * sy, widthMm: b.w * sx, x: it.x * sx, y: it.y * sy, letterSpacing, ...(zMm ? { z: zMm } : {}),
        depthMm: c.depthMm(part, o),
        // 앞면 색(시트)을 골랐으면 그 색이 글자 앞면 (2026-10-17)
        lighting: c.lighting(part), faceColor: surfaceOf(part).face ?? d.faceColor, sideColor: surfaceOf(part).side ?? d.sideColor, // 재료 층 마감 > 도색 키 (2026-10-21)
        ...c.look3d?.(part), // 몸통 마감·띄움·뒤 빛 (2026-10-23)
      });
    } else {
      const b = itemBox(it);
      faceItems.push({
        id: it.id, kind: it.kind, ...(it.kind === 'text' ? { text: it.text!.trim() } : {}), ...(it.kind === 'shape' ? { shape: it.shape ?? 'rect', ...(it.fill ? { fill: it.fill } : {}), ...(it.stroke ? { stroke: it.stroke } : {}) } : {}),
        x: b.x * sx, y: b.y * sy, w: b.w * sx, h: b.h * sy, color: surfaceOf(part).face ?? c.color, ...(zMm ? { z: zMm } : {}), // 시트 색 (2026-10-17)
      });
    }
  }
  // 글자 없는 면 시트 = 올라간 면 전체 (2026-10-22 "시트 2d 3d에서 안나온다") — 저장된 레이어 트리는 그대로 두고 그 시트만 앞면 객체로
  const all = drawnParts(o, partsOf(o));
  for (const part of withSheetAreas(o, all, { w: o.widthMm || est?.w || p.w, h: o.heightMm || est?.h || p.h })) { // 치수가 없으면 그린 자리 크기
    const src = all.find((x) => x.id === part.id);
    if (!src || src.items.length || !part.items.length) continue;
    const host = part.on && part.on !== 'frame' ? all.find((x) => x.id === part.on) : undefined;
    const zMm = host ? componentOf(host.kind).depthMm(host, o) * Math.min(sx, sy) : 0;
    const it = part.items[0];
    faceItems.push({ id: it.id, kind: 'shape', shape: 'rect', ...(it.fill ? { fill: it.fill } : {}), ...(it.opacity !== undefined ? { opacity: it.opacity } : {}), x: it.x * sx, y: it.y * sy, w: (it.w ?? 0) * sx, h: it.h * sy, color: it.fill ?? componentOf(part.kind).color, ...(zMm ? { z: zMm } : {}) });
  }
  faceItems.sort((a, b) => (a.z ?? 0) - (b.z ?? 0)); // 앞면(텍스처)에 깔리는 것부터, 같은 높이는 트리 순서
  return { ...(letterItems.length ? { letterItems } : {}), ...(faceItems.length ? { faceItems } : {}) };
}

/** 사인물을 벽면 위 3D 간판으로. 채널 + 문구 = 입체 글자, 그 외 = 박스(보드) / 얇은 면(시트) / 분류 없음 = 회색 판 */
/** est: 치수를 넣지 않은 사인물의 추정 치수(mm, 실측) — 글자·시트 면 축척에만 쓴다(자리·원근은 그대로) */
export function renderSpecOf(o: SignObject, p: Placement, est?: { w: number; h: number } | null): SignSpec | null {
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
  const tl = lightOf(o, p.w, p.h); // 상단 조명 구성 요소 (2026-10-19)
  // 부속 3D (몰딩·지주, 2026-10-19): 종류 모듈의 scene — mm 는 그린 자리 축척으로
  const k = p.h / (o.heightMm || p.h);
  const accessories = partsOf(o).flatMap((part) => { const a = componentOf(part.kind).scene?.(part, frameHex(o) ?? frameDefaultColor(o)); if (!a) return []; return [a.kind === 'molding' ? { ...a, widthMm: a.widthMm * k } : { ...a, heightMm: a.heightMm * k, sizeMm: a.sizeMm * k }]; });
  const base = { ...(accessories.length ? { accessories } : {}), id: o.id, text, x: p.cx, y: p.cy, letterSpacing: l?.letterSpacing ?? DEFAULT_LETTER3D.letterSpacing, textColor: '#111111', ...(tl ? { topLight: { kind: tl.kind, count: tl.count, armMm: tl.armMm, color: tl.color, side: tl.side, aim: tl.aim, ...(tl.fixture ? { fixture: tl.fixture } : {}) } } : {}) };
  const d = { ...DEFAULT_LETTER3D, ...(l ?? {}) };
  // 면 시트는 치수가 없어도·옛 시트(sheetIds)여도 그린 자리 크기로 (2026-10-22 "시트가 2d 3d에 적용이 안됐어")
  if ((o.parts && (o.widthMm || o.heightMm)) || hasPartsToDraw(o)) {
    const comp = composedOf(o, p, d, base.letterSpacing, est ?? undefined);
    if (comp.letterItems || comp.faceItems) {
      // 몸통 없음·옛 채널 제품·스카시 분류 = 상자 없이 글자만 (사인물 자체가 글자)
      const bodyless = bodyId === 'body-none' || isChannelProduct(o.productId) || SCASHI_IDS.has(o.productId ?? '');
      const look0 = bodyless ? UNCLASSIFIED_LOOK : product ? (BOARD_LOOK[product.id] ?? { faceColor: DEFAULT_LETTER3D.faceColor, depthMm: 100 }) : cat === 'sheet' ? SHEET_LOOK : UNCLASSIFIED_LOOK;
      const look = { ...look0, faceColor: bodyPaintHex(o) ?? look0.faceColor };
      return {
        ...base, text: '', kind: 'lightbox', widthMm: p.w, heightMm: p.h, corner: o.shape === 'ellipse' ? 0.5 : o.corner,
        depthMm: bodyless ? 0 : o.depthMm ?? look.depthMm,
        lighting: !bodyless && isLitBody(bodyId, o) ? 'front' : 'none',
        faceColor: look.faceColor, sideColor: frameHex(o) ?? frameDefaultColor(o), frameMm: bodyless ? 0 : frameMmOf(o), ...comp, ...(bodyless ? { bodyless: true } : {}),
        // 시트만 붙는 사인물(몸통 제품 없음)은 바탕 투명 — 시트 면·글자만 보이고 유리·벽은 그대로 (2026-10-22)
        ...(!product && cat === 'sheet' ? { clearFace: true } : {}),
      };
    }
  }
  // 몸통 없음 + 채널 + 문구 = 입체 글자만 (글자 높이 = 그린 영역 세로)
  if (bodyId === 'body-none' && channelId && text) {
    return { ...base, kind: 'channel', heightMm: p.h, widthMm: p.w, depthMm: d.depthMm, lighting: lightingOf(channelId), faceColor: d.faceColor, sideColor: d.sideColor };
  }
  if (bodyId === 'body-none' && scashiId && text) {
    return { ...base, kind: 'channel', heightMm: p.h, widthMm: p.w, depthMm: scDepth, lighting: 'none', faceColor: d.faceColor, sideColor: d.sideColor };
  }
  const look1 = product ? (BOARD_LOOK[product.id] ?? { faceColor: DEFAULT_LETTER3D.faceColor, depthMm: 100 }) : cat === 'sheet' ? SHEET_LOOK : UNCLASSIFIED_LOOK;
  const look = { ...look1, faceColor: bodyPaintHex(o) ?? look1.faceColor }; // 컬러 피커로 고른 몸통 색 (2026-10-17)
  // 몸통 + 채널 + 문구 = 상자 위에 입체 글자. 글자 높이는 옵션(없으면 영역 세로의 60%)
  const fromParts = (h: number) => (h && o.heightMm ? Math.min(p.h * 0.9, (h / o.heightMm) * p.h) : p.h * 0.6);
  const letters = o.parts && lp && text ? { text, heightMm: fromParts(partH), depthMm: componentOf(lp.kind).depthMm(lp, o), lighting: componentOf(lp.kind).lighting(lp), faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing }
    : channelId && text ? { text, heightMm: Number(o.options?.chHeight) || (channelHeightOf(o) && o.heightMm ? Math.min(p.h * 0.6, (channelHeightOf(o)! / o.heightMm) * p.h) : p.h * 0.6), depthMm: d.depthMm, lighting: lightingOf(channelId), faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing }
    : scashiId && text ? { text, heightMm: Number(o.options?.scHeight) && o.heightMm ? Math.min(p.h * 0.9, (Number(o.options?.scHeight) / o.heightMm) * p.h) : p.h * 0.6, depthMm: scDepth, lighting: 'none' as const, faceColor: d.faceColor, sideColor: d.sideColor, letterSpacing: base.letterSpacing } : undefined;
  return {
    ...base, kind: 'lightbox', widthMm: p.w, heightMm: p.h, corner: o.shape === 'ellipse' ? 0.5 : o.corner,
    depthMm: o.depthMm ?? l?.depthMm ?? look.depthMm, // 입력한 두께 > 입체 설정 > 종류 기본
    // 내부 조명 옵션이 '비조명'이면 빛나지 않는다 (2026-10-16, 상단 조명은 주로 비조명 간판에)
    lighting: isLitBody(bodyId, o) ? 'front' : 'none',
    faceColor: letters ? look.faceColor : l?.faceColor ?? look.faceColor, // 글자가 있으면 입체 색은 글자 것
    sideColor: frameHex(o) ?? (letters ? frameDefaultColor(o) : l?.sideColor ?? frameDefaultColor(o)),
    frameMm: frameMmOf(o),
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
