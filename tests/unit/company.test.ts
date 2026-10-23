import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPANY, ftcUrl } from '../../src/lib/core/company';

// 결제사 홈페이지 심사 (2026-10-23 토스 "홈페이지 아래쪽 사업자 정보 — 상호명·사업자등록번호·사업장주소·대표전화번호·대표자명"): xlpop 과 같은 사업자
const page = (name: string) => readFileSync(`public/${name}.html`, 'utf8');

describe('사업자 정보', () => {
  it('xlpop 과 같은 가오낙스 사업자 정보', () => {
    expect(COMPANY).toMatchObject({ name: '가오낙스', representative: '김성범', bizNo: '271-79-00651', mailOrderNo: '2025-경기이천-0538', address: '경기도 이천시 부발읍 대산로 515-12 은행나무안채', phone: '031-632-0907', email: 'support@ganpanda.co.kr' });
    expect(ftcUrl()).toBe('https://www.ftc.go.kr/bizCommPop.do?wrkr_no=2717900651');
  });

  it('정적 페이지(요금제·약관·환불·개인정보) 아래에도 같은 사업자 정보와 서로의 링크', () => {
    for (const name of ['pricing', 'terms', 'refund', 'privacy']) {
      const html = page(name);
      for (const v of [COMPANY.name, COMPANY.representative, COMPANY.bizNo, COMPANY.mailOrderNo, COMPANY.address, COMPANY.phone, COMPANY.email]) expect(html, `${name}: ${v}`).toContain(v);
      for (const href of ['/pricing', '/terms', '/refund', '/privacy']) expect(html, `${name} → ${href}`).toContain(`href="${href}"`);
    }
  });

  it('요금제 페이지: 실제 가격(0원 아님)·결제 방법·배송 없음, 환불 정책에도 배송', () => {
    const p = page('pricing');
    for (const t of ['30,000원', '60,000원', '부가가치세 포함', '토스페이먼츠', '배송']) expect(p).toContain(t);
    expect(page('refund')).toContain('배송');
  });
});
