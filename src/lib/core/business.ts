// 사업자등록번호 (2026-10-21 결정 "사업자 확인": 로그인 위에 얹는 "어느 사업체인가" — 국세청 API 는 서버 business.ts)
// 여기는 입력 정리·검증 자릿수(국세청 공개 알고리즘)·표시만

/** 숫자만 (하이픈·공백 제거) */
export const bizDigits = (s: string) => s.replace(/\D/g, '');

/** 10자리 + 검증 자릿수: 가중치 1 3 7 1 3 7 1 3 5, 9번째는 ×5 의 십의 자리까지 */
export function isValidBizNo(s: string): boolean {
  const d = bizDigits(s);
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** 123-45-67890 */
export function formatBizNo(s: string): string {
  const d = bizDigits(s).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** 개업일 입력(2020-01-05 · 2020.1.5 · 20200105) → YYYYMMDD, 아니면 null */
export function bizStartDate(s: string): string | null {
  const d = s.replace(/\D/g, '');
  if (d.length !== 8) return null;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6)), day = Number(d.slice(6, 8));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31) return null;
  return d;
}

/** 국세청 상태 코드 → 표시 */
export const BIZ_STATUS_LABEL: Record<string, string> = { active: '계속사업자', suspended: '휴업', closed: '폐업' };
export type BizStatus = keyof typeof BIZ_STATUS_LABEL;

/** 계정에 붙은 사업자 (서버 `businesses` 행의 공개 부분) */
export interface Business { no: string; name: string; ownerName: string; startDate: string; status: BizStatus; verifiedAt: number; checkedAt: number; /** 사업장 주소 (2026-10-24) */ address?: string; /** 주소의 지역 — 요청 받기 기본 지역 */ region?: string }
