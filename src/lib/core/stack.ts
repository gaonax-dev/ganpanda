// 재료 층 (2026-10-21 사용자: "스카시 선택하면 고무를 선택했다 하고 여기에 기본은 얇은 철판인데 어떤 경우는 고무만 사용하잖아. 나는 이때 결합된 상태로 제공하고 필요한 상태를 추가하고 싶은 거야
// 시트나 페인트를, 사실 페인트는 어디든 쓸 수 있거든" → "스카시부터 진행해줘").
// 구성 요소 하나 = 뒤에서 앞으로 쌓인 재료 층(재료·두께)이고, 마감(도색·시트)은 어느 층의 앞면·옆면에도 붙는다.
// 종류(고무 스카시 등)는 기본 묶음(프리셋)일 뿐 — 층을 빼고(철판 없이 고무만) 더한다(면판·시트). 도색 색은 options 의 도색 객체(접두사)로 읽어 기존 컬러 피커·라이브러리를 그대로 쓴다.
import type { Finish, MaterialLayer } from './model';
import { sheetById } from './catalog';
import { colorHex, paintHex, paintLabel } from './materials';

export interface StackMaterial { id: string; label: string; paintable: boolean }
/** 재료 층에 쓰는 재료 (materials.ts 의 프레임 재질과 별개 — 글자 재료) */
export const STACK_MATERIALS: StackMaterial[] = [
  { id: 'iron', label: '철판', paintable: true },
  { id: 'rubber', label: '고무', paintable: true },
  { id: 'alu', label: '알루미늄', paintable: true },
  { id: 'alu-gold', label: '알루미늄 금색', paintable: false },
  { id: 'alu-silver', label: '알루미늄 은색', paintable: false },
  { id: 'stain', label: '스텐', paintable: true },
  { id: 'titan', label: '티타늄판', paintable: false },
  { id: 'acrylic', label: '아크릴', paintable: true },
  { id: 'foamex', label: '포맥스', paintable: true },
  // 채널 재료 (S2, 2026-10-22): 갈바 판 · LED 모듈(두께 없음 — 몸통 안)
  { id: 'galva', label: '갈바', paintable: true },
  { id: 'led', label: 'LED', paintable: false },
];
/** 재료를 올릴 때의 기본 두께 (T, 확인 필요 — 흔한 값) */
export const STACK_DEFAULT_T: Record<string, number> = { iron: 1.5, rubber: 20, alu: 1, 'alu-gold': 1, 'alu-silver': 1, stain: 1.2, titan: 1.2, acrylic: 8, foamex: 10, galva: 1.2, led: 0 };
/** 스카시 컷팅 (2026-10-22 "컷팅이 스카시에 붙어서 하위 재료가 모두 적용된다") — 스카시 옵션 cut */
export const SCASHI_CUTS: { id: string; label: string }[] = [
  { id: '', label: '컷팅 미정' }, { id: 'laser', label: '레이저 컷팅' }, { id: 'cnc', label: 'CNC 라우터' }, { id: 'waterjet', label: '워터젯' }, { id: 'knife', label: '칼(플로터) 컷팅' },
];
export const cutLabel = (id: unknown) => SCASHI_CUTS.find((c) => c.id === id && c.id)?.label ?? null;
/** 견적 종류(단가표 제품)를 올린 재료로: 티타늄이 있으면 티타늄 스카시, 가장 두꺼운 층이 아크릴이면 아크릴 스카시, 그 밖은 고무 스카시. 재료가 없으면 null */
export function inferScashiType(stack: MaterialLayer[]): string | null {
  if (!stack.length) return null;
  if (stack.some((l) => l.material === 'titan')) return 'sc-titan';
  const thick = stack.reduce((a, l) => (l.thickness > a.thickness ? l : a), stack[0]);
  return thick.material === 'acrylic' ? 'ch-scashi' : 'ch-rubber';
}
export const stackMaterialLabel = (id: string) => STACK_MATERIALS.find((m) => m.id === id)?.label ?? id;

const uid = () => Math.random().toString(36).slice(2, 10);
const mk = (l: Omit<MaterialLayer, 'id'>): MaterialLayer => ({ id: uid(), ...l });

/**
 * 종류별 기본 묶음 (확인 필요 — 2026-10-21 사용자: "모르시면 흔한 값으로 넣고 문서에 확인 필요로"):
 * 고무 스카시 = 철판 1.5T 밑판 + 고무 20T · 티타늄 스카시 = 철판 1.5T + 고무 10T + 티타늄판 1.2T · 아크릴 스카시 = 아크릴 8T
 */
export function defaultStack(type: string, bodyThickness?: number): MaterialLayer[] {
  // 맨 위 층 앞면은 도색 마감 자리(접두사 'paint' — 색을 고르기 전엔 "도색 없음")로 두어 전처럼 도색 피커가 바로 보인다
  const facePaint: Finish = { kind: 'paint', ref: 'paint' };
  if (type === 'ch-scashi') return [mk({ material: 'acrylic', thickness: bodyThickness ?? 8, role: 'body', face: facePaint })];
  if (type === 'sc-titan') return [mk({ material: 'iron', thickness: 1.5, role: 'base' }), mk({ material: 'rubber', thickness: bodyThickness ?? 10, role: 'body' }), mk({ material: 'titan', thickness: 1.2, role: 'face', face: facePaint })];
  return [mk({ material: 'iron', thickness: 1.5, role: 'base' }), mk({ material: 'rubber', thickness: bodyThickness ?? 20, role: 'body', face: facePaint })];
}

/**
 * 채널 재료 층 기본 묶음 (S2, 2026-10-22 — 확인 필요: 흔한 구성으로): 뒤(벽 쪽) → 앞. 두께 합 = 채널 깊이
 * 전광 = 갈바 뒷판 1.2T · LED · 알루미늄 옆판 · 아크릴 앞판 3T / 후광 = 아크릴 뒷판 3T · LED · 갈바 옆판 · 갈바 앞판 1.2T /
 * 전후광 = 아크릴 뒷판 · LED · 알루미늄 옆판 · 아크릴 앞판 / 갈바 에폭시(비조명) = 갈바 세 겹 / 통아크릴 = LED · 아크릴 몸통 / 벌브 = 갈바 뒷판 · LED · 갈바 옆판(앞이 열림)
 */
export function defaultChannelStack(type: string, depth = 80, /** 캡 단차 높이 = 앞판 두께 (mm, 2026-10-23) */ step = 0): MaterialLayer[] {
  const L = (material: string, thickness: number, role?: MaterialLayer['role']) => mk({ material, thickness: Math.max(0, Math.round(thickness * 10) / 10), ...(role ? { role } : {}) });
  const led = L('led', 0);
  switch (type) {
    case 'ch-front': if (step > 0) return [L('galva', 1.2, 'base'), led, L('alu', depth - 1.2 - step, 'body'), L('acrylic', step, 'face')];
      return [L('galva', 1.2, 'base'), led, L('alu', depth - 4.2, 'body'), L('acrylic', 3, 'face')];
    case 'ch-halo': return [L('acrylic', 3, 'base'), led, L('galva', depth - 4.2, 'body'), L('galva', 1.2, 'face')];
    case 'ch-both': return [L('acrylic', 3, 'base'), led, L('alu', depth - 6, 'body'), L('acrylic', 3, 'face')];
    case 'ch-acrylic': return [led, L('acrylic', depth, 'body')];
    case 'ch-bulb': return [L('galva', 1.2, 'base'), led, L('galva', depth - 1.2, 'body')];
    default: return [L('galva', 1.2, 'base'), L('galva', depth - 2.4, 'body'), L('galva', 1.2, 'face')];
  }
}

export const stackDepth = (stack: MaterialLayer[]) => stack.reduce((t, l) => t + (Number.isFinite(l.thickness) ? l.thickness : 0), 0);
const fmtT = (t: number) => `${Math.round(t * 10) / 10}T`;
/** 몸통 층: role body, 없으면 맨 위 */
export const bodyLayer = (stack: MaterialLayer[]) => stack.find((l) => l.role === 'body') ?? stack[stack.length - 1];

export function addLayer(stack: MaterialLayer[], layer: Omit<MaterialLayer, 'id'>, at: 'top' | 'bottom'): MaterialLayer[] {
  const l = mk(layer);
  return at === 'top' ? [...stack, l] : [l, ...stack];
}
export const removeLayer = (stack: MaterialLayer[], id: string) => stack.filter((l) => l.id !== id);
export const updateLayer = (stack: MaterialLayer[], id: string, patch: Partial<Omit<MaterialLayer, 'id'>>) => stack.map((l) => (l.id === id ? { ...l, ...patch } : l));
export function setFinish(stack: MaterialLayer[], id: string, where: 'face' | 'side', finish: Finish | null): MaterialLayer[] {
  return stack.map((l) => { if (l.id !== id) return l; const n = { ...l }; if (finish) n[where] = finish; else delete n[where]; return n; });
}

/** 마감 선택 값 (화면의 셀렉트): 'none' | 'paint' | 'sheet:<종류>' */
export const finishOption = (layer: MaterialLayer, where: 'face' | 'side'): string => { const f = layer[where]; return !f ? 'none' : f.kind === 'sheet' ? `sheet:${f.ref}` : 'paint'; };
/** 마감 문구: "도색 흰색" / "재질 시트" / null */
export function finishLabel(layer: MaterialLayer, where: 'face' | 'side', opts: Record<string, unknown> | undefined): string | null {
  const f = layer[where];
  if (!f) return null;
  if (f.kind === 'sheet') return sheetById(f.ref)?.name ?? '시트';
  const c = paintLabel(opts, f.ref);
  return c ? `도색 ${c}` : null; // 색을 고르기 전("도색 없음")은 마감 없음
}
/** "철판 1.5T + 고무 20T · 앞면 재질 시트 · 옆면 도색 검정" (opts 가 있으면 마감도) */
export function stackLabel(stack: MaterialLayer[], opts?: Record<string, unknown>): string {
  const mats = stack.map((l) => (l.thickness ? `${stackMaterialLabel(l.material)} ${fmtT(l.thickness)}` : stackMaterialLabel(l.material))).join(' + '); // 두께 없는 층(LED)은 이름만
  if (!opts) return mats;
  const ext: string[] = [];
  for (const l of stack) { const f = finishLabel(l, 'face', opts); if (f) ext.push(`앞면 ${f}`); }
  for (const l of stack) { const s = finishLabel(l, 'side', opts); if (s) ext.push(`옆면 ${s}`); }
  return [mats, ...ext].join(' · ');
}

/** 2D·3D 색: 앞면 = 맨 위 층의 앞면 마감(도색 색 / 시트면 faceSheet), 옆면 = 위에서부터 처음 만나는 옆면 도색 */
export function surfaceOf(stack: MaterialLayer[], opts: Record<string, unknown> | undefined): { face: string | null; side: string | null; faceSheet?: string } {
  const top = stack[stack.length - 1];
  const out: { face: string | null; side: string | null; faceSheet?: string } = { face: null, side: null };
  if (top?.face?.kind === 'paint') out.face = paintHex(opts, top.face.ref);
  else if (top?.face?.kind === 'sheet') out.faceSheet = top.face.ref;
  for (let i = stack.length - 1; i >= 0; i--) { const s = stack[i].side; if (s?.kind === 'paint') { out.side = paintHex(opts, s.ref); break; } }
  // 도색이 없으면 재료 자체의 색 (금색·은색 알루미늄)
  if (!out.face && !out.faceSheet && top) out.face = top.material === 'alu-gold' ? colorHex('금색') : top.material === 'alu-silver' ? colorHex('은색') : null;
  return out;
}

/** 옛 스카시 옵션(두께·재질·도색) → 재료 층. 도색은 맨 위 층 앞면·몸통 옆면에 접두사 'paint'(값은 options 그대로) */
export function stackFromLegacy(type: string, opts: Record<string, string | boolean> | undefined): MaterialLayer[] {
  const o = opts ?? {};
  const t = parseFloat(String(o.thickness ?? ''));
  let stack = defaultStack(type, Number.isFinite(t) && t > 0 ? t : undefined);
  const mat = String(o.material ?? '');
  if (type === 'ch-rubber') {
    const face: Record<string, Omit<MaterialLayer, 'id'>> = {
      '칼라 알루미늄': { material: 'alu', thickness: 1, role: 'face' }, '수입 금색': { material: 'alu-gold', thickness: 1, role: 'face' }, '수입 은색': { material: 'alu-silver', thickness: 1, role: 'face' },
      '아크릴 전면판': { material: 'acrylic', thickness: 3, role: 'face' },
    };
    if (face[mat]) { stack = setFinish(stack, bodyLayer(stack).id, 'face', null); stack = addLayer(stack, face[mat], 'top'); } // 면판이 덮으므로 몸통 앞면 도색 자리는 뺀다
    else if (mat === '시트 부착') stack = setFinish(stack, bodyLayer(stack).id, 'face', { kind: 'sheet', ref: 'sh-cut' });
  }
  if (o.paintSystem && o.paintSystem !== '도색 없음') {
    const top = stack[stack.length - 1];
    if (!top.face) stack = setFinish(stack, top.id, 'face', { kind: 'paint', ref: 'paint' });
    stack = setFinish(stack, bodyLayer(stack).id, 'side', { kind: 'paint', ref: 'paint' }); // 옛 도색은 앞면·옆면 모두
  }
  return stack;
}
