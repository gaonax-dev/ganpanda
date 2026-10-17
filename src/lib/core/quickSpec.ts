// 빠른 설정 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k").
// 설정 창(치수 아래)과 휴대폰 빠른 막대에 세 칩: 몸통(종류·색) · 채널(종류·색) · LED(색온도). 값은 기존 옵션·구성 요소에 그대로 저장되고
// 색은 "기본색" 도색 객체(색 이름)로 — 세부 설정(PANTONE·RAL 코드, 광택)은 아래 사양 묶음에서 그대로 가능.
import type { SignObject, SignPart } from './model';
import { CHANNEL_OPTIONS, productById } from './catalog';
import { colorHex, PAINT_SYSTEMS, paintLabel } from './materials';
import { optionGroupsFor } from './options';
import { commitParts, newItem, newPart, partsOf } from './parts';
import { DEFAULT_LETTER3D } from './letter3d';

const BASIC = PAINT_SYSTEMS[1]; // 기본색
const NONE = PAINT_SYSTEMS[0]; // 도색 없음

/** LED 색 → 색온도 표기 (값은 그대로 저장, 표시만) */
export const LED_KELVIN: Record<string, string> = { 백색: '5700K', 주백색: '4000K', 전구색: '3000K' };
export const ledLabel = (v: string) => (LED_KELVIN[v] ? `${v} (${LED_KELVIN[v]})` : v);

export interface QuickSpec {
  body: { productId: string | null; name: string | null; color: string | null; /** 도색 객체 키 접두사 (paint / framePaint), 없으면 도색 불가 */ paintKey: string | null };
  channel: { partId: string | null; type: string; name: string; color: string | null } | null;
  led: { value: string; label: string; kelvin: string | null } | null;
}

/** 이 몸통의 도색 객체 키: 도색(paint) > 바탕색(face, 후렉스·천갈이) > 프레임 도색(framePaint) */
function paintKeyOf(o: SignObject): string | null {
  const keys = new Set(optionGroupsFor(o).flatMap((g) => g.fields.map((f) => f.key)));
  // 재질이 도색 불가(텐션 천)면 framePaintSystem 이 안 보인다 — 그래도 기본색을 고르면 재질을 그대로 두고 도색 키만 쓴다
  return keys.has('paintSystem') ? 'paint' : keys.has('faceSystem') ? 'face' : keys.has('framePaintSystem') || keys.has('frameMat') ? 'framePaint' : null;
}

export function quickSpecOf(o: SignObject): QuickSpec {
  const product = productById(o.productId);
  const paintKey = product ? paintKeyOf(o) : null;
  const ch = partsOf(o).find((p) => p.kind === 'channel');
  const chName = ch ? CHANNEL_OPTIONS.find((c) => c.id === ch.type)?.label ?? ch.type : null;
  const led = ch?.options?.ledColor as string | undefined;
  return {
    body: { productId: product?.id ?? null, name: product?.name ?? null, color: paintKey ? paintLabel(o.options, paintKey) : null, paintKey },
    channel: ch ? { partId: ch.id.startsWith('legacy-') ? null : ch.id, type: ch.type, name: chName!, color: paintLabel(ch.options, 'body') } : null,
    led: ch && led ? { value: led, label: ledLabel(led), kelvin: LED_KELVIN[led] ?? null } : null,
  };
}

export interface QuickPatch {
  productId?: string;
  /** 색 이름(기본색), null = 도색 없음 */
  bodyColor?: string | null;
  /** 채널 종류 id, null = 채널 없음 */
  channelType?: string | null;
  channelColor?: string | null;
  led?: string;
}

/** 빠른 설정 → 사인물 패치. 채널 관련이 있으면 구성 요소로 저장(옛 채널 옵션 정리)하고, 채널 색은 3D 색(letter3d)도 맞춘다 */
export function applyQuick(o: SignObject, q: QuickPatch): Partial<SignObject> {
  let patch: Partial<SignObject> = {};
  let options: Record<string, string | boolean> = { ...(o.options ?? {}) };
  if (q.productId !== undefined) patch.productId = q.productId;
  if (q.bodyColor !== undefined) {
    const key = paintKeyOf({ ...o, productId: q.productId ?? o.productId }) ?? 'paint';
    if (q.bodyColor === null) { options[`${key}System`] = NONE; delete options[`${key}Code`]; }
    else options = { ...options, [`${key}System`]: BASIC, [`${key}Code`]: q.bodyColor };
  }
  if (q.channelType !== undefined || q.channelColor !== undefined || q.led !== undefined) {
    const parts: SignPart[] = JSON.parse(JSON.stringify(partsOf(o)));
    let ch = parts.find((p) => p.kind === 'channel');
    if (q.channelType === null) {
      if (ch) { const gone = ch.id; parts.splice(parts.indexOf(ch), 1); for (const p of parts) if (p.on === gone) p.on = 'frame'; }
      ch = undefined;
    } else {
      if (!ch) {
        ch = newPart('channel', q.channelType ?? 'ch-front');
        // 사인물 문구가 있으면 첫 글자 객체로 (옛 사인물과 같은 규칙)
        if (o.text?.trim()) ch.items.push({ ...newItem('text'), text: o.text, h: o.heightMm ?? 300 });
        parts.unshift(ch);
      } else if (q.channelType) ch.type = q.channelType;
      ch.options = { ...(ch.options ?? {}) };
      if (q.channelColor === null) { ch.options.bodySystem = NONE; delete ch.options.bodyCode; }
      else if (q.channelColor) { ch.options.bodySystem = BASIC; ch.options.bodyCode = q.channelColor; }
      if (q.led) ch.options.ledColor = q.led;
    }
    const committed = commitParts({ ...o, options }, parts);
    patch = { ...patch, ...committed };
    options = committed.options ?? options;
    // 3D 색: 채널 색을 옆면에, 발광하지 않는 채널(후광·에폭시 등)은 앞면에도
    if (ch && q.channelColor) {
      const hex = colorHex(q.channelColor);
      if (hex) {
        const lit = ch.type === 'ch-front' || ch.type === 'ch-both' || ch.type === 'ch-acrylic' || ch.type === 'ch-bulb';
        patch.letter3d = { ...DEFAULT_LETTER3D, ...(o.letter3d ?? {}), sideColor: hex, ...(lit ? {} : { faceColor: hex }) };
      }
    }
  }
  patch.options = options;
  return patch;
}
