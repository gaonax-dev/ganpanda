// 채널 (입체 글자, 조명): 세부 종류 = 채널 제품 (전광·후광·전후광·갈바 에폭시·통아크릴·벌브)
import type { Component } from './types';
import type { SignObject } from '../model';
import { CHANNEL_NONE, CHANNEL_OPTIONS, productById } from '../catalog';
import { CHANNEL_FIELDS, LED_KELVIN } from '../optionSchema';
import { paintLabel } from '../materials';
import { DEFAULT_LETTER3D, lightingOf } from '../letter3d';
import { lettersPrice } from './letters';

const typeLabel = (type: string) => CHANNEL_OPTIONS.find((c) => c.id === type)?.label ?? productById(type)?.name ?? type;

export const channel: Component = {
  kind: 'channel', label: '채널', color: '#ff6b5e', types: CHANNEL_OPTIONS,
  hasSpec: false, sits: false, layer: 100, itemWidth: false, extrude: true,
  typeLabel: (p) => typeLabel(p.type),
  spec: (p) => typeLabel(p.type),
  chip: (p) => { const led = p.options?.ledColor as string | undefined; return { text: `${typeLabel(p.type).replace(' 채널', '')}${led ? ` ${LED_KELVIN[led] ?? led}` : ''}`, color: paintLabel(p.options, 'body') }; },
  // 채널 세부(채널 선택 제외, 고른 채널 종류 기준 조건). 글자 높이는 글자 객체가 가진다
  optionFields: (part) => {
    const ctx = { ...(part.options ?? {}), channel: CHANNEL_OPTIONS.find((c) => c.id === part.type)?.label ?? CHANNEL_NONE };
    return CHANNEL_FIELDS.slice(1).filter((f) => f.key !== 'chHeight' && (!f.when || f.when(ctx, {} as SignObject)));
  },
  host: (p) => `${typeLabel(p.type)} 앞면`,
  depthMm: (_p, o) => ({ ...DEFAULT_LETTER3D, ...(o.letter3d ?? {}) }).depthMm,
  lighting: (p) => lightingOf(p.type),
  paint: { face: 'face', side: 'body' }, // 앞면 색(시트) · 측면 재질 도색
  price: (p, ctx) => lettersPrice(p, `${ctx.o.name} · ${typeLabel(p.type)}`, ctx),
};
