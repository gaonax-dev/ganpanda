// 부속 구성 요소 (2026-10-19 사용자: "컴포넌트 추가한다고 했는데"): 몰딩 · 지주 · LED 모듈. 상단 조명처럼 객체 없이 프레임에 붙는다.
// 사양은 알리다 2025-03 단가표 품목을 근거로 잡은 기본값 — 스텐몰딩(m), 갈바 통·사인탑 지주(m), 백색 3구 LED(개). 공급사 사양이 정해지면 옵션·단가 방식을 여기서 고친다
import type { Component } from './types';
import type { SignObject, SignPart } from '../model';
import { productById } from '../catalog';
import { LED_MODULE_FIELDS, MOLDING_FIELDS, MOLD_COLOR_MODES, POLE_COLOR_MODES, POLE_FIELDS } from '../optionSchema';
import { paintHex } from '../materials';
import { fmt } from '../priceFormat';
import { shapeAreaM2 } from '../shapeArea';

const name = (type: string) => productById(type)?.name ?? type;
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const fields = (fs: typeof MOLDING_FIELDS) => (part: SignPart) => { const opts = part.options ?? {}; return fs.filter((f) => !f.when || f.when(opts, {} as SignObject)); };
const base = { termKey: 'product' as const, takesItems: false, hasSpec: false, sits: false, itemWidth: false, extrude: false, depthMm: () => 0, lighting: () => 'none' as const, paint: { face: 'face', side: 'face' } };

/** 몰딩이 두르는 길이 (mm) */
const EDGES: Record<string, 'all' | 'tb' | 'lr'> = { '테두리 전체': 'all', 상하: 'tb', 좌우: 'lr' };
export function moldingLengthMm(edges: 'all' | 'tb' | 'lr', w: number, h: number): number { return edges === 'tb' ? 2 * w : edges === 'lr' ? 2 * h : 2 * (w + h); }
const MOLD_MATERIAL: Record<string, string> = { 'md-stain': '#c4c7ca', 'md-alu': '#d9dcdf' };

export const molding: Component = {
  ...base, kind: 'molding', label: '몰딩', color: '#b8c0c8', layer: 210,
  types: [{ id: 'md-stain', label: '스텐 몰딩' }, { id: 'md-alu', label: '알루미늄 몰딩' }],
  typeLabel: (p) => name(p.type),
  spec: (p) => [name(p.type), p.options?.moldEdges && p.options.moldEdges !== '테두리 전체' ? String(p.options.moldEdges) : ''].filter(Boolean).join(' '),
  chip: (p) => ({ text: name(p.type), color: paintHex(p.options, 'mold') }),
  optionFields: fields(MOLDING_FIELDS),
  scene: (p, signColor) => ({
    kind: 'molding', edges: EDGES[String(p.options?.moldEdges ?? '')] ?? 'all', widthMm: num(p.options?.moldWidth, 30),
    color: p.options?.moldColorMode === MOLD_COLOR_MODES[1] ? signColor : p.options?.moldColorMode === MOLD_COLOR_MODES[2] ? paintHex(p.options, 'mold') ?? MOLD_MATERIAL[p.type] ?? '#c4c7ca' : MOLD_MATERIAL[p.type] ?? '#c4c7ca',
  }),
  price: (p, ctx) => {
    const { o, prices } = ctx;
    const label = `${o.name} · ${name(p.type)}`, unit = prices.products[p.type] ?? 0;
    if (!o.widthMm || !o.heightMm) { ctx.need(label, '치수 필요'); return; }
    const edges = EDGES[String(p.options?.moldEdges ?? '')] ?? 'all';
    const m = moldingLengthMm(edges, o.widthMm, o.heightMm) / 1000;
    ctx.finish(label, `${String(p.options?.moldEdges ?? '테두리 전체')} ${m.toFixed(2)}m × ${fmt(unit)}원/m`, m * unit, p.type);
  },
};

export const pole: Component = {
  ...base, kind: 'pole', label: '지주', color: '#8a9099', layer: 220,
  types: [{ id: 'pl-galva', label: '갈바 통 지주' }, { id: 'pl-signtop', label: '사인탑 갈바 지주' }, { id: 'pl-alu', label: '사인탑 알루미늄 지주' }],
  typeLabel: (p) => name(p.type),
  spec: (p) => `${name(p.type)} ${num(p.options?.poleCount, 2)}개`,
  chip: (p) => ({ text: `${name(p.type).replace(' 지주', '')} ${num(p.options?.poleCount, 2)}개`, color: paintHex(p.options, 'pole') }),
  optionFields: fields(POLE_FIELDS),
  scene: (p, signColor) => ({
    kind: 'pole', count: num(p.options?.poleCount, 2), heightMm: num(p.options?.poleHeight, 2500), sizeMm: num(p.options?.poleSize, 100),
    color: p.options?.poleColorMode === POLE_COLOR_MODES[1] ? paintHex(p.options, 'pole') ?? signColor : signColor,
  }),
  // 지주 하나 길이 = 지면 ~ 간판 아래(높이) + 간판 세로 (간판을 잡고 올라간다)
  price: (p, ctx) => {
    const { o, prices } = ctx;
    const label = `${o.name} · ${name(p.type)}`, unit = prices.products[p.type] ?? 0;
    const count = num(p.options?.poleCount, 2), len = (num(p.options?.poleHeight, 2500) + (o.heightMm ?? 0)) / 1000;
    ctx.finish(label, `${count}개 × ${len.toFixed(2)}m × ${fmt(unit)}원/m`, count * len * unit, p.type);
  },
};

/** LED 모듈 자동 수량: 면적 ㎡ 당 70개 (3구 모듈 약 120mm 간격) */
export const LED_PER_M2 = 70;
export function moduleCountOf(p: SignPart, o: SignObject): number | null {
  const typed = Math.floor(Number(p.options?.moduleCount));
  if (typed > 0) return typed;
  return o.widthMm && o.heightMm ? Math.max(1, Math.ceil(shapeAreaM2(o) * LED_PER_M2)) : null;
}
export const ledModule: Component = {
  ...base, kind: 'led', label: 'LED 모듈', color: '#fff2b0', layer: 230, litsBody: true,
  types: [{ id: 'led-3', label: 'LED 모듈 (3구)' }],
  typeLabel: (p) => name(p.type),
  spec: (p) => [name(p.type), Number(p.options?.moduleCount) > 0 ? `${Math.floor(Number(p.options?.moduleCount))}개` : '', String(p.options?.moduleColor ?? '')].filter(Boolean).join(' '),
  chip: (p) => ({ text: `LED ${Number(p.options?.moduleCount) > 0 ? `${Math.floor(Number(p.options?.moduleCount))}개` : '자동'}`, color: null }),
  optionFields: fields(LED_MODULE_FIELDS),
  price: (p, ctx) => {
    const { o, prices } = ctx;
    const label = `${o.name} · ${name(p.type)}`, unit = prices.products[p.type] ?? 0;
    const n = moduleCountOf(p, o);
    if (n === null) { ctx.need(label, '치수 또는 모듈 수량 필요'); return; }
    ctx.finish(label, `${n}개 × ${fmt(unit)}원${Number(p.options?.moduleCount) > 0 ? '' : ` (면적 × ${LED_PER_M2}개/㎡)`}`, n * unit, p.type);
  },
};
