// 규칙 기반 견적. 단가는 예시값 — 업체 단가표로 교체하세요.
import type { Measured, SignSpec } from './types';

export const PRICE_RULES = {
  /** 채널 간판: 글자 1자당 (글자높이 cm × 단가) */
  channelPerCharPerCm: { front: 3200, halo: 3800, none: 2200 } as Record<SignSpec['lighting'], number>,
  /** 박스(아크릴/플렉스) 간판: m² 당 */
  lightboxPerM2: { front: 280000, halo: 280000, none: 160000 } as Record<SignSpec['lighting'], number>,
  /** 간판 1개당 설치·운반비 */
  installPerSign: 250000,
  /** 최소 금액 */
  minimum: 300000,
  vatRate: 0.1,
};

export interface QuoteLine {
  label: string;
  detail: string;
  amount: number;
}

export function quoteSign(spec: SignSpec, m: Measured): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const lightLabel = { front: '전광', halo: '후광', none: '비조명' }[spec.lighting];
  if (spec.kind === 'channel') {
    const unit = PRICE_RULES.channelPerCharPerCm[spec.lighting] * (m.heightMm / 10);
    lines.push({
      label: `채널 간판(${lightLabel}) "${spec.text}"`,
      detail: `${m.charCount}자 × 높이 ${Math.round(m.heightMm)}mm (자당 ${won(unit)})`,
      amount: Math.max(PRICE_RULES.minimum, Math.round(unit * m.charCount)),
    });
  } else {
    const area = (m.widthMm * m.heightMm) / 1e6;
    lines.push({
      label: `박스 간판(${lightLabel}) "${spec.text}"`,
      detail: `${Math.round(m.widthMm)}×${Math.round(m.heightMm)}mm = ${area.toFixed(2)}㎡`,
      amount: Math.max(PRICE_RULES.minimum, Math.round(area * PRICE_RULES.lightboxPerM2[spec.lighting])),
    });
  }
  lines.push({ label: '설치·운반', detail: '', amount: PRICE_RULES.installPerSign });
  return lines;
}

export function won(n: number): string {
  return Math.round(n).toLocaleString('ko-KR') + '원';
}
