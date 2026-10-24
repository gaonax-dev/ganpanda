import { describe, expect, it } from 'vitest';
import { KOREA_REGIONS, regionLabel } from '../../src/lib/core/regions';
import { regionOfAddress } from '../../src/lib/core/region';

// 요청 받기 지역 체크 목록 (2026-10-24 사용자: "요청 지역설정을 사업자 주소로 먼저 설정하고 나머지는 원하는 지역을 설정할 수 있게 체크방식으로 해줘")
describe('전국 시·도 → 시·군·구', () => {
  it('17개 시·도, 광역시는 구·군 · 도는 시·군 (주요 개수)', () => {
    expect(KOREA_REGIONS.map((r) => r.sido)).toEqual(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']);
    const n = (s: string) => KOREA_REGIONS.find((r) => r.sido === s)!.areas.length;
    expect(n('서울')).toBe(25); expect(n('경기')).toBe(31); expect(n('부산')).toBe(16); expect(n('강원')).toBe(18);
    expect(n('전남')).toBe(22); expect(n('경북')).toBe(22); expect(n('경남')).toBe(18); expect(n('제주')).toBe(2);
    for (const r of KOREA_REGIONS) expect(new Set(r.areas).size).toBe(r.areas.length);
  });
  it('저장 이름 = 주소에서 뽑는 지역과 같은 꼴 ("경기 성남시", "서울 송파구", 세종은 "세종")', () => {
    expect(regionLabel('경기', '성남시')).toBe(regionOfAddress('경기도 성남시 중원구 성남대로 1').split(' ').slice(0, 2).join(' '));
    expect(regionLabel('서울', '송파구')).toBe(regionOfAddress('서울특별시 송파구 올림픽로 300'));
    expect(regionLabel('세종', '세종')).toBe('세종');
  });
});
