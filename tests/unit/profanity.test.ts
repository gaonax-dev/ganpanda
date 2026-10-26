// 욕설 거르기 (2026-10-26 신고·차단 — 앱스토어 1.2 "부적절한 콘텐츠를 거르는 방법"): 보낼 때 가린다
import { describe, expect, it } from 'vitest';
import { maskProfanity } from '../../src/lib/core/profanity';

describe('maskProfanity', () => {
  it('욕설은 같은 길이의 * 로 가린다 (띄어쓰기·대소문자 무관)', () => {
    expect(maskProfanity('이 씨발 간판')).toBe('이 ** 간판');
    expect(maskProfanity('병신 같네')).toBe('** 같네');
    expect(maskProfanity('what the FUCK')).toBe('what the ****');
    expect(maskProfanity('개새끼야')).toBe('***야');
  });
  it('보통 말은 그대로 — 간판·시발점 같은 낱말은 건드리지 않는다', () => {
    expect(maskProfanity('시발점에서 출발해요')).toBe('시발점에서 출발해요');
    expect(maskProfanity('간판 크기 3000×600')).toBe('간판 크기 3000×600');
    expect(maskProfanity('')).toBe('');
  });
});
