// 꾸밈 자가 복구 (2026-10-21 "css가 깨진 상태")
import { describe, expect, it } from 'vitest';
import { cssMissing, healedHref } from '../../src/lib/core/cssHeal';

describe('CSS 자가 복구', () => {
  it('--bg 가 비어 있으면 전역 스타일이 안 먹은 것', () => {
    expect(cssMissing('')).toBe(true); expect(cssMissing('  ')).toBe(true); expect(cssMissing(' #0f1115')).toBe(false);
  });
  it('같은 파일에 r=시각을 붙인 새 주소 (기존 r 은 바꾼다)', () => {
    expect(healedHref('/assets/index-abc.css', 1700)).toBe('/assets/index-abc.css?r=1700');
    expect(healedHref('https://ganpanda.co.kr/assets/index-abc.css?r=1', 1700)).toBe('https://ganpanda.co.kr/assets/index-abc.css?r=1700');
  });
});
