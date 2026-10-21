// 주소 → 지역, 지역 맞춤 (2026-10-21 "지역입력은 주소와 중복된다")
import { describe, expect, it } from 'vitest';
import { normRegion, regionMatches, regionOfAddress } from '../../src/lib/core/region';

describe('주소에서 지역', () => {
  it('시/도 짧은 이름 + 시/군/구(+구)', () => {
    expect(regionOfAddress('경기도 성남시 중원구 성남대로1140번길 15, B1층(성남동)')).toBe('경기 성남시 중원구');
    expect(regionOfAddress('경기도 이천시 부발읍 대산로 515-12')).toBe('경기 이천시');
    expect(regionOfAddress('서울특별시 송파구 올림픽로 300')).toBe('서울 송파구');
    expect(regionOfAddress('전라북도 전주시 완산구 효자로 1')).toBe('전북 전주시 완산구');
    expect(regionOfAddress('강원특별자치도 춘천시 중앙로 1')).toBe('강원 춘천시');
    expect(regionOfAddress('광주광역시 서구 상무대로 1')).toBe('광주 서구');
    expect(regionOfAddress('성남시 분당구 판교역로 1')).toBe('성남시 분당구'); // 시/도 생략
    expect(regionOfAddress('')).toBe('');
  });
});

describe('지역 맞춤 (간판사 ↔ 요청)', () => {
  it('한쪽이 다른 쪽을 포함하면 받는다, 공백·긴 이름 무시', () => {
    expect(normRegion('경기도 성남시')).toBe('경기성남시');
    expect(regionMatches('경기 광주시', '경기 광주시')).toBe(true);
    expect(regionMatches('성남시', '경기 성남시 중원구')).toBe(true);
    expect(regionMatches('경기 성남시 분당구', '경기 성남시 중원구')).toBe(false);
    expect(regionMatches('경기도 광주시', '경기 광주시')).toBe(true);
    expect(regionMatches('광주 서구', '경기 광주시')).toBe(false); // 광주광역시 ≠ 경기 광주시
    expect(regionMatches('', '경기 광주시')).toBe(false);
  });
});
