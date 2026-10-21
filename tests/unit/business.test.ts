// 사업자등록번호 정리·검증 (2026-10-21 "사업자 등록으로 확인하는 건?")
import { describe, expect, it } from 'vitest';
import { bizDigits, bizStartDate, formatBizNo, isValidBizNo } from '../../src/lib/core/business';

describe('사업자등록번호', () => {
  it('검증 자릿수가 맞는 번호만 (국세청 알고리즘)', () => {
    expect(isValidBizNo('220-81-62517')).toBe(true); // 흔히 예로 쓰는 번호
    expect(isValidBizNo('1248100998')).toBe(true);
    expect(isValidBizNo('220-81-62518')).toBe(false);
    expect(isValidBizNo('123')).toBe(false);
    expect(isValidBizNo('0000000000')).toBe(true); // 형식상 통과 — 등록 여부는 국세청이 답한다
  });
  it('숫자만 남기고 123-45-67890 으로 보여 준다', () => {
    expect(bizDigits(' 220-81-62517 ')).toBe('2208162517');
    expect(formatBizNo('2208162517')).toBe('220-81-62517');
    expect(formatBizNo('2208')).toBe('220-8');
    expect(formatBizNo('22')).toBe('22');
  });
  it('개업일은 YYYYMMDD 로', () => {
    expect(bizStartDate('2020-01-05')).toBe('20200105');
    expect(bizStartDate('2020.1.05')).toBeNull(); // 7자리
    expect(bizStartDate('20200105')).toBe('20200105');
    expect(bizStartDate('2020-13-01')).toBeNull();
  });
});
