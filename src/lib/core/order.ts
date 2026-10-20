// 주문 (2026-10-14): 프로젝트 주문 정보 + 사인물 사양 + 파일 → 주문서·JSON
import { partLabel, partsOf, signTextOf } from './parts';
import { finishLabel, stackMaterialLabel } from './stack';
import { partSupplierLabel } from './terms';

/** 구성 요소의 공급사 용어 (연결된 공급사가 있고 이름이 다를 때) */
function supplierFields(p: import('./model').SignPart, prices: import('./pricing').PriceTable | null | undefined): { supplier?: string; supplier_label?: string } {
  const r = partSupplierLabel(p, prices, partLabel(p));
  return r.supplier ? { supplier: r.supplier, supplier_label: r.label } : {};
}
import { categoryOf, CATEGORY_GROUPS, productById, sheetById } from './catalog';
import type { DesignSource, SignObject } from './model';
import { describeOptions, effectiveOptions, effectivePartOptions } from './options';
import { isPreviewPart } from './parts';
import { paintLabel } from './materials';
import type { Quote } from './quote';

export type DeliveryType = 'install' | 'ship' | 'pickup';
export const DELIVERY_LABEL: Record<DeliveryType, string> = { install: '시공 요청', ship: '배송', pickup: '방문 수령' };

/** 프로젝트에 저장하는 주문 정보 (settings.order) */
export interface OrderInfo {
  customer?: string;
  company?: string;
  phone?: string;
  delivery?: DeliveryType;
  address?: string;
  /** YYYY-MM-DD */
  dueDate?: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  /** 조합형 구성 요소 (2026-10-16) */
  parts?: { kind: string; type: string; label: string; /** 연결 공급사 id · 그 공급사의 용어 (2026-10-19) */ supplier?: string; supplier_label?: string; on?: string; /** 재료 층 (2026-10-21): 뒤→앞, 마감은 앞면·옆면 */ stack?: { material: string; thickness_mm: number; role?: string; face?: string; side?: string }[]; options: Record<string, string | boolean>; items: Omit<import('./model').PartItem, 'id'>[] }[];
  name: string;
  category: string;
  type: string;
  sheets: string[];
  options: Record<string, string | boolean>;
  option_summary: string[];
  size?: { width_mm: number; height_mm: number; depth_mm?: number; estimated: boolean };
  text?: string;
  design_file?: string;
  amount: number;
  note?: string;
}

export interface OrderJson {
  project: string;
  created_at: string;
  order_info: OrderInfo & { delivery_label?: string };
  items: OrderItem[];
  files: { name: string; pages: number }[];
  file_check: string[];
  totals: { items: number; install: number; extras: number; subtotal: number; vat: number; total: number; vat_included: boolean };
  notes?: string;
}

export const FILE_CHECK = ['CMYK 모드', '글자 윤곽선(Outlines) 처리', '돔보·시트 컷팅용 칼선 레이어 분리', '벡터 원본(.ai/.pdf/.eps) 첨부'];

/** 미리보기 (디자이너 참고): 배경색 + 글자·그림 자리 — 실제 원고는 design_file (2026-10-21) */
function previewOf(o: SignObject): { preview?: { note: string; background?: string; items?: { kind: string; text?: string; image?: string; h: number; w?: number; x: number; y: number }[] } } {
  const background = paintLabel(o.options, 'face') ?? undefined;
  const items = partsOf(o).filter(isPreviewPart).flatMap((p) => p.items.map((it) => ({ kind: it.kind, ...(it.text ? { text: it.text } : {}), ...(it.image && 'name' in it.image && it.image.name ? { image: it.image.name } : {}), h: it.h, ...(it.w ? { w: it.w } : {}), x: it.x, y: it.y })));
  if (!background && !items.length) return {};
  return { preview: { note: '미리보기 — 디자이너 참고용, 실제 원고는 design_file', ...(background ? { background } : {}), ...(items.length ? { items } : {}) } };
}

export function orderJson(args: {
  projectName: string;
  signs: SignObject[];
  sizeOf: (o: SignObject) => { w: number; h: number; estimated: boolean } | null;
  sources: DesignSource[];
  quote: Quote;
  order: OrderInfo;
  now?: Date;
  /** 단가표 — 구성 요소에 연결된 공급사의 용어를 함께 적는다 (2026-10-19 V5 "공급사의 용어가 우선한다") */
  prices?: import('./pricing').PriceTable | null;
}): OrderJson {
  const { signs, sizeOf, sources, quote, order, prices } = args;
  const items: OrderItem[] = signs.map((o) => {
    const cat = categoryOf(o);
    const p = productById(o.productId);
    const sz = sizeOf(o);
    const src = o.design && sources.find((s) => s.id === o.design!.sourceId);
    return {
      id: o.id,
      name: o.name,
      category: cat ? CATEGORY_GROUPS.find((g) => g.id === cat)!.label : '미분류',
      type: p?.name ?? (o.sheetIds.length ? '시트' : ''),
      sheets: o.sheetIds.map((id) => sheetById(id)?.name ?? id),
      options: effectiveOptions(o),
      option_summary: describeOptions(o, { defaults: true }),
      // 조합형 구성 요소 (2026-10-16): 종류·이름·옵션(기본값 포함)·글자·그림
      // 미리보기(배경색·출력 글자·그림)는 사양이 아니라 디자이너 참고 — parts 에서 빼고 preview 에 따로 (2026-10-21)
      ...previewOf(o),
      ...(partsOf(o).filter((p) => !isPreviewPart(p)).length ? { parts: partsOf(o).filter((p) => !isPreviewPart(p)).map((p) => ({ kind: p.kind, type: p.type, label: partLabel(p), ...supplierFields(p, prices), ...(p.on ? { on: p.on } : {}), ...(p.stack ? { stack: p.stack.map((l) => ({ material: stackMaterialLabel(l.material), thickness_mm: l.thickness, ...(l.role ? { role: l.role } : {}), ...(finishLabel(l, 'face', p.options) ? { face: finishLabel(l, 'face', p.options)! } : {}), ...(finishLabel(l, 'side', p.options) ? { side: finishLabel(l, 'side', p.options)! } : {}) })) } : {}), options: effectivePartOptions(p), items: p.items.map(({ id: _id, ...it }) => it) })) } : {}),
      ...(sz ? { size: { width_mm: Math.round(sz.w), height_mm: Math.round(sz.h), ...(o.depthMm ? { depth_mm: Math.round(o.depthMm) } : {}), estimated: sz.estimated } } : {}),
      ...(signTextOf(o) ? { text: signTextOf(o) } : {}), // 문구가 없으면 구성내역 (2026-10-16)
      ...(src ? { design_file: `${src.name} (${o.design!.page + 1}쪽)` } : {}),
      amount: quote.lines.filter((l) => l.objectId === o.id).reduce((a, l) => a + l.amount, 0),
      ...(o.note ? { note: o.note } : {}),
    };
  });
  return {
    project: args.projectName,
    created_at: (args.now ?? new Date()).toISOString(),
    order_info: { ...order, ...(order.delivery ? { delivery_label: DELIVERY_LABEL[order.delivery] } : {}) },
    items,
    files: sources.map((s) => ({ name: s.name, pages: s.pages.length })),
    file_check: FILE_CHECK,
    totals: {
      items: quote.itemsTotal, install: quote.install, extras: quote.extras.reduce((a, e) => a + e.amount, 0),
      subtotal: quote.subtotal, vat: quote.vat, total: quote.total, vat_included: quote.vatIncluded,
    },
    ...(order.notes ? { notes: order.notes } : {}),
  };
}
