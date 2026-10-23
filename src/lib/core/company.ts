// 운영 사업자 (2026-10-23 결제사 홈페이지 심사: "홈페이지 아래쪽 사업자 정보 — 상호명·사업자등록번호·사업장주소·대표전화번호·대표자명").
// xlpop 과 같은 사업자(사용자: "xlpop와 같아"). 정적 페이지(public/pricing·terms·refund·privacy.html)의 푸터도 같은 값 — tests/unit/company.test.ts 가 맞춰 본다
export const COMPANY = {
  name: '가오낙스',
  representative: '김성범',
  bizNo: '271-79-00651',
  mailOrderNo: '2025-경기이천-0538',
  address: '경기도 이천시 부발읍 대산로 515-12 은행나무안채',
  phone: '031-632-0907',
  email: 'support@ganpanda.co.kr',
} as const;
/** 공정거래위원회 사업자정보 확인 */
export const ftcUrl = () => `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${COMPANY.bizNo.replace(/-/g, '')}`;
