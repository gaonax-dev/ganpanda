// 견적 문구 공통 (잎 모듈)
export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const roundTo = (n: number, unit: number) => Math.round(n / unit) * unit;
/** 계산법 설명의 공급 단가(숫자원)를 배수 적용 단가로 바꿔 보인다 — 고객에게 공급가·배수를 드러내지 않는다 */
export const scaled = (detail: string, mk: number) => (mk === 1 ? detail : detail.replace(/([\d,]+)원/g, (_, n: string) => `${fmt(Number(n.replace(/,/g, '')) * mk)}원`));

/**
 * 견적 줄 설명에서 금액만 뺀다 (2026-10-22 "금액이 빠진 품목 리스트") — 실측 보기의 품목 리스트용.
 * "× 35,000원" · "1개 12,000원" · "→ 기본가 30,000원" · "· ○○ 단가" 를 지우고 수량·크기·옵션은 남긴다
 */
export function itemDetail(detail: string): string {
  return detail
    .replace(/\s*·\s*[^·]*단가\s*$/, '')
    .replace(/\s*(?:×|→\s*기본가|기본가)?\s*[\d,.]+\s*원/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*·\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
