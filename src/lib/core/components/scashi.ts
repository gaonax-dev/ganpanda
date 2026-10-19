// 스카시 (비조명 입체 글자): 세부 종류 = 스카시 제품 (고무·티타늄·아크릴), 두께 = 옵션 thickness (T)
import type { Component } from './types';
import type { SignObject } from '../model';
import { SCASHI_OPTIONS, productById } from '../catalog';
import { PRODUCT_OPTIONS } from '../optionSchema';
import { paintLabel } from '../materials';
import { lettersPrice } from './letters';

const typeLabel = (type: string) => productById(type)?.name ?? type;

export const scashi: Component = {
  kind: 'scashi', label: '스카시', color: '#e0b85a', types: SCASHI_OPTIONS,
  termKey: 'product',
  hasSpec: false, sits: false, layer: 100, itemWidth: false, extrude: true,
  typeLabel: (p) => typeLabel(p.type),
  spec: (p) => typeLabel(p.type),
  chip: (p) => ({ text: typeLabel(p.type).replace(' 스카시', ''), color: paintLabel(p.options, 'paint') }),
  optionFields: (part) => { const opts = part.options ?? {}; return (PRODUCT_OPTIONS[part.type] ?? []).filter((f) => !f.when || f.when(opts, {} as SignObject)); },
  // 스카시 위에는 올리지 않는다 (host 없음)
  depthMm: (p) => parseFloat(String(p.options?.thickness ?? '')) || 10,
  lighting: () => 'none',
  paint: { face: 'paint', side: 'paint' }, // 도색 (2D 정면도와 같은 키 — 전엔 3D 가 채널 키를 봐서 스카시 도색이 안 비쳤다)
  price: (p, ctx) => lettersPrice(p, `${ctx.o.name} · ${typeLabel(p.type)}`, ctx),
};
