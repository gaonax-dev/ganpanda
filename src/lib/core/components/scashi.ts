// 스카시 (비조명 입체 글자): 세부 종류 = 스카시 제품 (고무·티타늄·아크릴) = 재료 층의 기본 묶음 (2026-10-21 core/stack.ts).
// 두께 = 층 두께의 합, 앞면·옆면 색 = 층의 마감(도색·시트). 티타늄 색·아크릴 종류는 옵션 material 로 남긴다
import type { Component } from './types';
import type { SignObject, SignPart } from '../model';
import { SCASHI_OPTIONS, productById, sheetById } from '../catalog';
import { PRODUCT_OPTIONS, paintFields } from '../optionSchema';
import { bodyLayer, defaultStack, stackDepth, stackFromLegacy, stackLabel, stackMaterialLabel, surfaceOf } from '../stack';
import { paintLabel } from '../materials';
import { lettersPrice } from './letters';

const typeLabel = (type: string) => productById(type)?.name ?? type;
const stackOf = (p: SignPart) => p.stack ?? stackFromLegacy(p.type, p.options);
/** 옵션에서 재료 층이 맡는 키는 빼고 보인다 (두께 → 층, 고무의 재질 → 면판 층) */
const hidden = (type: string) => new Set(['thickness', ...(type === 'ch-rubber' ? ['material'] : [])]);

export const scashi: Component = {
  kind: 'scashi', label: '스카시', color: '#e0b85a', types: SCASHI_OPTIONS,
  termKey: 'product',
  takesItems: true,
  hasSpec: true, sits: false, layer: 100, itemWidth: false, extrude: true,
  init: (p) => ({ ...p, stack: defaultStack(p.type) }),
  normalize: (p) => (p.stack ? p : { ...p, stack: stackFromLegacy(p.type, p.options) }),
  typeLabel: (p) => typeLabel(p.type),
  spec: (p) => `${typeLabel(p.type)} (${stackLabel(stackOf(p), p.options)})`,
  chip: (p) => { const s = stackOf(p); return { text: stackLabel(s), color: finishColorLabel(s, p.options) }; },
  optionFields: (part) => {
    const opts = part.options ?? {}, skip = hidden(part.type);
    const base = (PRODUCT_OPTIONS[part.type] ?? []).filter((f) => !skip.has(f.key) && !(f.paint && f.paint.prefix === 'paint') && (!f.when || f.when(opts, {} as SignObject)));
    // 층마다 도색 마감이면 그 접두사의 컬러 피커 (맨 위 층 앞면 접두사 'paint' 는 옛 도색 값 그대로)
    const extra = stackOf(part).flatMap((l) => (['face', 'side'] as const).flatMap((w) => (l[w]?.kind === 'paint' ? paintFields(l[w]!.ref, `${stackMaterialLabel(l.material)} ${w === 'face' ? '앞면' : '옆면'} 도색`) : [])))
      .filter((f) => !f.when || f.when(opts, {} as SignObject)); // 체계를 골라야 코드·광택 (도색 객체 규칙)
    return [...base, ...extra];
  },
  depthMm: (p) => stackDepth(stackOf(p)),
  lighting: () => 'none',
  paint: { face: 'paint', side: 'paint' },
  surface: (p) => surfaceOf(stackOf(p), p.options),
  price: (p, ctx) => {
    const s = stackOf(p);
    const noBase = !s.some((l) => l.role === 'base') && p.type !== 'ch-scashi';
    lettersPrice(p, `${ctx.o.name} · ${ctx.term(`product:${p.type}`, typeLabel(p.type))}${noBase ? ' (철판 없음)' : ''}`, ctx);
    // 앞면 시트 마감: 글자 상자 면적 × 시트 단가 (2026-10-21)
    const sheetLayer = s.find((l) => l.face?.kind === 'sheet');
    if (sheetLayer) {
      const type = sheetLayer.face!.ref, unit = ctx.prices.sheets[type] ?? 0, name = ctx.term(`sheet:${type}`, sheetById(type)?.name ?? type);
      // 글자 상자 면적 (frontView.itemBox 와 같은 추정 — 그 모듈은 견적을 거쳐 레지스트리로 되돌아오므로 여기서 직접)
      const m2 = p.items.reduce((t, it) => { const n = it.count ?? Math.max(1, (it.text ?? '').replace(/\s/g, '').length); const w = it.w ?? (it.kind === 'text' ? n * it.h * 0.9 : it.h); return t + (w * it.h) / 1e6; }, 0);
      const label = `${ctx.o.name} · ${typeLabel(p.type)} 앞면 시트 ${name}`;
      if (!(m2 > 0)) ctx.need(label, '글자·치수 필요'); else ctx.finish(label, `${m2.toFixed(2)}㎡ × ${Math.round(unit).toLocaleString('ko-KR')}원`, m2 * unit, type, undefined, 'face-sheet');
    }
  },
};

function finishColorLabel(s: ReturnType<typeof stackOf>, opts: SignPart['options']): string | null {
  const top = s[s.length - 1], body = bodyLayer(s);
  if (top?.face?.kind === 'paint') return paintLabel(opts, top.face.ref);
  if (top?.face?.kind === 'sheet') return sheetById(top.face.ref)?.name ?? null;
  if (body?.side?.kind === 'paint') return paintLabel(opts, body.side.ref);
  return null;
}
