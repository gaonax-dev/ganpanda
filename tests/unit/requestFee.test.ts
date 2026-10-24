import { describe, expect, it } from 'vitest';
import { requestFee } from '../../src/lib/core/requestFee';
import { missingForRequest } from '../../src/lib/core/estimateRequest';

describe('요청 크레딧 (2026-10-24 — 서버 credit.ts 와 같아야 한다)', () => {
  it('자동 견적 × 0.3%, 100원 단위 올림, 최저 3,000 · 최고 50,000', () => {
    expect(requestFee(2_800_000)).toBe(8_400);
    expect(requestFee(1_234_567)).toBe(3_800);
    expect(requestFee(0)).toBe(3_000);
    expect(requestFee(undefined)).toBe(3_000);
    expect(requestFee(16_666_667)).toBe(50_000);
    expect(requestFee(3e8)).toBe(50_000);
  });
  it('층은 요청에 꼭 — 빠지면 안내', () => {
    const base = { identity: 'general' as const, store: '가게', phone: '01012345678', address: '경기도 광주시 경안로 1', photos: 1 };
    expect(missingForRequest({ ...base, floor: '' })).toContain('층 (예: 1층, 2~3층, 옥상)');
    expect(missingForRequest({ ...base, floor: '2층' })).toEqual([]);
  });
});
