// 상단 조명 (2026-10-19 사용자: "상단 조명부터 컴포넌트로 옮겨줘"; 원래 2026-10-16 몸통 옵션 topLight): 돌출 투광등 · 트러스 바 간접조명 · 트러스 타공 조명.
// 세부 종류 = 단가 항목(tl-arm/tl-bar/tl-perf), 옵션 = 투광등 개수·팔 길이·빛 색. 글자·그림 객체는 없다. 견적: 투광등 = 개수 × 원/개, 트러스 = 간판 가로(m) × 원/m
import type { Component } from './types';
import type { SignObject } from '../model';
import { TOP_LIGHTS, TOP_COLORS, topLightFrom } from '../topLight';
import { TOP_LIGHT_FIELDS } from '../optionSchema';
import { fmt } from '../priceFormat';

const typeLabel = (type: string) => TOP_LIGHTS.find((t) => t.priceId === type)?.label ?? type;
function spec(type: string, opts: Record<string, unknown> | undefined): string {
  const n = Math.floor(Number(opts?.topCount));
  return [typeLabel(type), type === 'tl-arm' && n > 0 ? `${n}개` : ''].filter(Boolean).join(' ');
}

export const light: Component = {
  kind: 'light', label: '상단 조명', color: '#ffd27a',
  types: TOP_LIGHTS.map((t) => ({ id: t.priceId, label: t.label })),
  termKey: 'product', takesItems: false, fromBody: true,
  hasSpec: false, sits: false, layer: 200, itemWidth: false, extrude: false,
  typeLabel: (p) => typeLabel(p.type),
  spec: (p) => spec(p.type, p.options),
  chip: (p) => ({ text: spec(p.type, p.options), color: TOP_COLORS[String(p.options?.topColor ?? '')] ?? null }),
  // 몸통 옵션 때의 필드 그대로 (종류 선택 제외): 투광등이면 개수·팔 길이, 빛 색
  optionFields: (part) => { const ctx = { ...(part.options ?? {}), topLight: typeLabel(part.type) }; return TOP_LIGHT_FIELDS.slice(1).filter((f) => !f.when || f.when(ctx, {} as SignObject)); },
  depthMm: () => 0,
  lighting: () => 'none',
  paint: { face: 'face', side: 'face' },
  quoteKey: (o) => `${o.id}:top`, // 몸통 옵션 때의 줄 키 — 수동 금액 유지
  price: (p, ctx) => {
    const { o, prices } = ctx;
    const tl = topLightFrom(p.type, p.options, o.widthMm ?? 0);
    if (!tl) return;
    const label = `${o.name} · ${tl.label}`, unit = prices.products[tl.priceId] ?? 0;
    if (tl.kind === 'arm') ctx.finish(label, `${tl.count}개 × ${fmt(unit)}원`, tl.count * unit, tl.priceId);
    else if (!o.widthMm) ctx.need(label, '치수 필요');
    else ctx.finish(label, `가로 ${(o.widthMm / 1000).toFixed(2)}m × ${fmt(unit)}원/m`, (o.widthMm / 1000) * unit, tl.priceId);
  },
};
