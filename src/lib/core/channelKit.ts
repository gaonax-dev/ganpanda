// 채널 키트 (2026-10-31 사용자: "그림카드로 체널 형태를 선택하면 글자 하나만 나오겠지 그아래 컬러를 지정하면 해당 면의 색상이 변경되게 …
// 최종적으로는 gltf가 낙점되었어" → "구운 라이트맵 방향으로 진행해줘"): 채널 구성 요소의 종류·옵션 → 키트 모델(public/channel-models)과 면별 색.
// 모델·라이트맵 만들기는 scripts/models (docs/features/channel-models.md)
import { paintHex } from './materials';
import { LED_HEX } from './components/channel';

export interface KitPart { type: string; options?: Record<string, unknown> }
export interface KitLook {
  face: string; side: string; cap: string; back: string;
  /** LED 빛 색 */
  led: string;
  /** 몸통 마감 (도장 · 헤어라인 · 미러 · 티타늄 …) */
  finish: string;
  /** 불이 들어오는 채널인가 (비조명·갈바는 아님) */
  lit: boolean;
}

const METAL_FINISH = /헤어라인|미러|티타늄/;

/** 키트 모델 id — 키트에 없는 종류(벌브·통아크릴 등)는 null (사진 그대로) */
export function kitVariantFor(p: KitPart): string | null {
  const o = p.options ?? {};
  const cap = String(o.chType ?? '').startsWith('캡');
  const acrylicBack = /아크릴/.test(String(o.chBack ?? ''));
  switch (p.type) {
    // 키트의 '전광'은 앞판 없는 열린 채널(벌브·LED 용) — 앞판 있는 전광 채널은 모두 전광 캡 모델 (2026-10-31)
    case 'ch-front': return 'front-lit-cap';
    case 'ch-bulb': return 'open-bulb';
    case 'ch-halo': return acrylicBack ? 'acrylic-halo' : 'halo';
    case 'ch-both': return acrylicBack ? (cap ? 'cap-acrylic-halo' : 'epoxy-acrylic-halo') : 'both-cap';
    case 'ch-galva': return 'epoxy';
    default: return null;
  }
}

export function kitLookFor(p: KitPart): KitLook {
  const o = p.options ?? {};
  const finish = String(o.chFinish ?? '도장');
  const side = paintHex(o, 'body') ?? (METAL_FINISH.test(finish) ? '#c9ccd1' : '#2b2f36');
  return {
    // 갈바(도장·에폭시 앞면)는 앞면도 몸통 색으로 칠한다
    face: p.type === 'ch-galva' ? (paintHex(o, 'face') ?? side) : (paintHex(o, 'face') ?? '#ffffff'),
    side,
    cap: paintHex(o, 'cap') ?? side,
    back: '#f4f4f0',
    led: LED_HEX[String(o.ledColor ?? '백색')] ?? LED_HEX.백색,
    finish,
    lit: o.chLight !== '비조명' && p.type !== 'ch-galva',
  };
}
