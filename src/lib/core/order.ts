// 주문 (2026-10-14): 프로젝트 주문 정보 + 사인물 사양 + 파일 → 주문서·JSON
import { categoryOf, CATEGORY_GROUPS, productById, sheetById } from './catalog';
import type { DesignSource, SignObject } from './model';
import { describeOptions, effectiveOptions } from './options';
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
  name: string;
  category: string;
  type: string;
  sheets: string[];
  options: Record<string, string | boolean>;
  option_summary: string[];
  size?: { width_mm: number; height_mm: number; estimated: boolean };
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

export function orderJson(args: {
  projectName: string;
  signs: SignObject[];
  sizeOf: (o: SignObject) => { w: number; h: number; estimated: boolean } | null;
  sources: DesignSource[];
  quote: Quote;
  order: OrderInfo;
  now?: Date;
}): OrderJson {
  const { signs, sizeOf, sources, quote, order } = args;
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
      ...(sz ? { size: { width_mm: Math.round(sz.w), height_mm: Math.round(sz.h), estimated: sz.estimated } } : {}),
      ...(o.text ? { text: o.text } : {}),
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
