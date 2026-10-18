// 견적 문구 공통 (잎 모듈)
export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const roundTo = (n: number, unit: number) => Math.round(n / unit) * unit;
/** 계산법 설명의 공급 단가(숫자원)를 배수 적용 단가로 바꿔 보인다 — 고객에게 공급가·배수를 드러내지 않는다 */
export const scaled = (detail: string, mk: number) => (mk === 1 ? detail : detail.replace(/([\d,]+)원/g, (_, n: string) => `${fmt(Number(n.replace(/,/g, '')) * mk)}원`));
