// 채널 (입체 글자, 조명): 세부 종류 = 채널 제품 (전광·후광·전후광·갈바 에폭시·통아크릴·벌브)
import type { Component } from './types';
import type { SignObject, SignPart } from '../model';
import { CHANNEL_NONE, CHANNEL_OPTIONS, productById } from '../catalog';
import { CHANNEL_FIELDS, LED_KELVIN } from '../optionSchema';
import { paintHex } from '../materials';
import { paintLabel } from '../materials';
import { DEFAULT_LETTER3D, lightingOf } from '../letter3d';
import { lettersPrice } from './letters';
import { defaultChannelStack, stackDepth } from '../stack';
import { CHANNEL_PRESETS } from '../channelLibrary';

/** 3D 글자 깊이 (사인물 letter3d) */
const letterDepth = (o?: SignObject) => ({ ...DEFAULT_LETTER3D, ...(o?.letter3d ?? {}) }).depthMm;

/** 캡 단차 높이 (mm) — 캡 단차 채널만 */
const stepOf = (p: SignPart) => (p.options?.chType === '캡 단차(아크릴)' ? Number(p.options?.chStep) || 0 : 0);
/** 몸통 마감 → 3D 금속 (2026-10-23 L2): 헤어라인·미러 스텐은 은색, 티타늄은 코팅 색의 거울 */
const FINISH_3D: Record<string, { finish: 'hairline' | 'mirror'; sideColor: string }> = {
  헤어라인: { finish: 'hairline', sideColor: '#c4c8cd' }, 미러: { finish: 'mirror', sideColor: '#dfe3e8' },
  '티타늄 골드': { finish: 'mirror', sideColor: '#c9a24a' }, '티타늄 로즈골드': { finish: 'mirror', sideColor: '#c48f7f' }, '티타늄 블랙': { finish: 'mirror', sideColor: '#2b2b2e' },
};
/** LED 색 → 벽 빛 색 */
export const LED_HEX: Record<string, string> = { 백색: '#f4f8ff', 주백색: '#fff0d8', 전구색: '#ffcf8a', 빨강: '#ff3b30', 파랑: '#2f6bff', RGB: '#f4f8ff' };
const unlit = (p: SignPart) => p.options?.chLight === '비조명';
const finishOf = (p: SignPart) => String(p.options?.chFinish ?? '도장');

const typeLabel = (type: string) => CHANNEL_OPTIONS.find((c) => c.id === type)?.label ?? productById(type)?.name ?? type;

export const channel: Component = {
  kind: 'channel', label: '채널', color: '#ff6b5e', types: CHANNEL_OPTIONS,
  termKey: 'product',
  takesItems: true,
  hasSpec: false, sits: false, layer: 100, itemWidth: false, extrude: true,
  // 재료 층 (S2, 2026-10-22): 저장된 재료 층이 없으면 3D 깊이(letter3d)로 종류의 기본 묶음을 보인다 — 층을 고치는 순간 저장(깊이 = 두께 합)
  stack: (p, o) => p.stack ?? defaultChannelStack(p.type, letterDepth(o), stepOf(p)).filter((l) => !unlit(p) || l.material !== 'led'), // 비조명이면 LED 층 없음 (2026-10-23)
  presetStack: (type, o) => defaultChannelStack(type, letterDepth(o)),
  presets: CHANNEL_PRESETS, // 15종 시안 사진으로 빠른 선택 (2026-10-23)
  typeLabel: (p) => typeLabel(p.type),
  spec: (p) => typeLabel(p.type),
  chip: (p) => { const led = p.options?.ledColor as string | undefined; return { text: `${typeLabel(p.type).replace(' 채널', '')}${led ? ` ${LED_KELVIN[led] ?? led}` : ''}`, color: paintLabel(p.options, 'body') }; },
  // 채널 세부(채널 선택 제외, 고른 채널 종류 기준 조건). 글자 높이는 글자 객체가 가진다
  optionFields: (part) => {
    const ctx = { ...(part.options ?? {}), channel: CHANNEL_OPTIONS.find((c) => c.id === part.type)?.label ?? CHANNEL_NONE };
    const painted = finishOf(part) === '도장'; // 마감이 도장이 아니면 몸통 도색 칸 없음 (2026-10-23)
    return CHANNEL_FIELDS.slice(1).filter((f) => f.key !== 'chHeight' && (painted || f.paint?.prefix !== 'body') && (!f.when || f.when(ctx, {} as SignObject)));
  },
  host: (p) => `${typeLabel(p.type)} 앞면`,
  depthMm: (p, o) => (p.stack?.length ? stackDepth(p.stack) : letterDepth(o)), // 재료 층이 있으면 두께 합
  lighting: (p) => (unlit(p) ? 'none' : lightingOf(p.type)), // 점등/비조명 (2026-10-23 L3)
  // 3D 모양 (2026-10-23 L2): 몸통 마감 · 까치발 띄움 거리(기본 30mm) · 전후광의 뒤 빛 · 뒤판이 앞면과 같으면 후광도 앞면 색
  look3d: (p) => {
    const f = FINISH_3D[finishOf(p)];
    const standoff = p.options?.bracket === true ? Number(p.options?.chStandoff) || 30 : undefined;
    const lit = channel.lighting(p);
    const backLit = p.type === 'ch-both' && lit !== 'none';
    // 벽에 번지는 빛 = LED 색, 뒤판이 앞면과 같으면 앞면 색 (후광·전후광·벌브 — 벌브는 전구 빛)
    const bulb = p.type === 'ch-bulb' && lit !== 'none' ? parseInt(String(p.options?.chBulbPitch ?? '')) || 70 : 0;
    const halo = backLit || lit === 'halo' || bulb ? (p.options?.chBack === '앞면과 같게' ? paintHex(p.options, 'face') : null) ?? LED_HEX[String(p.options?.ledColor ?? '백색')] ?? LED_HEX.백색 : null;
    // 일체형 = 앞면·옆면 함께 발광, 벌브 = 전구 간격 (L3)
    const sideLit = lit === 'front' && p.options?.chType === '일체형';
    return { ...(f ?? {}), ...(standoff ? { standoffMm: standoff } : {}), ...(backLit ? { backLit } : {}), ...(halo ? { haloColor: halo } : {}), ...(sideLit ? { sideLit } : {}), ...(bulb ? { bulbPitchMm: bulb } : {}) };
  },
  paint: { face: 'face', side: 'body' }, // 앞면 색(시트) · 몸통 도색 (3D 글자 옆면)
  price: (p, ctx) => lettersPrice(p, `${ctx.o.name} · ${ctx.term(`product:${p.type}`, typeLabel(p.type))}`, ctx),
};
