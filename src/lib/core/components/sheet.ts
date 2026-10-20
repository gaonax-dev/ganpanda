// 시트 (면에 깔리는 출력·커팅): 세부 종류 = UV 출력 / 재질 시트. 구성내역 = 종류 + 재질 + 컷팅 + 컷 방식 + 보조시트. 프레임 면·채널 앞면·다른 시트 위에 올린다
import type { Component } from './types';
import type { SignObject, SignPart } from '../model';
import { sheetById } from '../catalog';
import { SHEET_COMMON_OPTIONS, SHEET_OPTIONS, SHEET_SPEC_KEYS } from '../optionSchema';
import { evalArea, findMethod } from '../calcMethods';
import { markupFor } from '../markup';
import { fmt, scaled } from '../priceFormat';
import { shapeAreaM2 } from '../shapeArea';

const typeLabel = (type: string) => sheetById(type)?.name ?? type;
/** 옛 반컷팅(halfCut) → 컷 방식 반컷 */
const normalize = (p: SignPart): SignPart => {
  const op = p.options ?? {};
  if (op.halfCut === undefined) return p;
  const { halfCut, ...rest } = op;
  return { ...p, options: { ...rest, ...(halfCut === true && rest.cutMode === undefined ? { cutMode: '반컷' } : {}) } };
};
/** 구성내역 (2026-10-16 사용자: "문구가 없으면 구성내역을 문자에 넣는다. uv출력 돔보컷팅 완컷") */
/** 출력 (몸통 출력에 포함): 후렉스·천갈이의 글자·그림 자리 (2026-10-21 parts.ts addPrintItem) */
const included = (p: SignPart) => p.options?.included === true;
function spec(p: SignPart): string {
  if (included(p)) return '출력 미리보기 (디자이너 참고)'; // 실제 원고는 디자인 파일 (2026-10-21)
  const op = normalize(p).options ?? {};
  const cut = (op.cut as string | undefined) ?? (p.type === 'sh-print' ? '돔보컷팅' : '커팅');
  const on = cut !== '컷팅 없음';
  return [typeLabel(p.type), p.type === 'sh-cut' ? (op.sheetMat as string | undefined) ?? '단색' : '', on ? cut : '', on ? (op.cutMode as string | undefined) ?? '완컷' : '', on && op.cutMode !== '반컷' && op.transferTape === true ? '보조시트' : '']
    .filter(Boolean).join(' ');
}

export const sheet: Component = {
  kind: 'sheet', label: '시트', color: '#5aa8ff',
  // 시트 = UV 출력 / 재질 시트 (커팅은 옵션, 2026-10-16). 옛 안개 시트는 재질 "안개"
  types: [{ id: 'sh-print', label: 'UV 출력' }, { id: 'sh-cut', label: '재질 시트' }],
  termKey: 'sheet',
  takesItems: true,
  hasSpec: true, sits: true, layer: 0, itemWidth: true, extrude: false,
  init: (p) => ({ ...p, on: 'frame' }),
  normalize,
  typeLabel: (p) => typeLabel(p.type),
  spec,
  chip: (p) => ({ text: included(p) ? '미리보기' : spec(p), color: null }),
  optionFields: (part) => { if (included(part)) return []; const opts = part.options ?? {}; return [...SHEET_COMMON_OPTIONS, ...(SHEET_OPTIONS[part.type] ?? [])].filter((f) => !f.when || f.when(opts, {} as SignObject)); },
  specKeys: SHEET_SPEC_KEYS,
  host: (p) => (included(p) ? '미리보기 위' : `${spec(p)} 위`),
  depthMm: () => 0,
  lighting: () => 'none',
  paint: { face: 'sheet', side: 'sheet' },
  // 객체가 크기(가로·세로)를 가지면 그 면적 합, 아니면 간판 면적
  price: (p, ctx) => {
    const { o, prices } = ctx;
    const sh = sheetById(p.type);
    if (!sh || included(p)) return; // 출력은 몸통(후렉스) 단가에 포함
    const label = `${o.name} · ${spec(p).replace(typeLabel(p.type), ctx.term(`sheet:${p.type}`, typeLabel(p.type)))}`, unit = prices.sheets[p.type] ?? 0; // 종류 이름만 공급사 용어로, 재질·컷팅은 그대로
    const sizedItems = p.items.filter((it) => it.w && it.h);
    if (!sizedItems.length && !ctx.sized) { ctx.need(label, '치수 필요'); return; }
    const method = findMethod(prices.methods?.[p.type]);
    if (method && method.kind !== 'letters') {
      const rs = sizedItems.length ? sizedItems.map((it) => evalArea(method, it.w!, it.h)) : [evalArea(method, o.widthMm!, o.heightMm!, shapeAreaM2(o))];
      const amt = rs.reduce((a, r) => a + r.raw * markupFor(prices, r.item), 0);
      ctx.finish(label, rs.map((r) => scaled(r.detail, markupFor(prices, r.item))).join(' + '), amt, p.type, rs.reduce((a, r) => a + r.raw, 0));
      return;
    }
    const m2 = sizedItems.length ? sizedItems.reduce((a, it) => a + (it.w! * it.h) / 1e6, 0) : shapeAreaM2(o);
    ctx.finish(label, `${m2.toFixed(2)}㎡ × ${fmt(unit)}원`, m2 * unit, p.type);
  },
};
