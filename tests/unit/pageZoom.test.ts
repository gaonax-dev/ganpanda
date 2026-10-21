// 휴대폰 입력 뒤 페이지 확대 되돌리기 (2026-10-21 "모바일에서 입력기 등 사용으로 화면이 줌인된 후 입력을 마치면 다시 원래 줌으로")
import { describe, expect, it } from 'vitest';
import { shouldResetZoom, withMaxScale1 } from '../../src/lib/core/pageZoom';

describe('되돌릴 때', () => {
  it('확대돼 있고(1배 넘게) 다음 포커스가 입력칸이 아닐 때만', () => {
    expect(shouldResetZoom(1.6, false)).toBe(true);
    expect(shouldResetZoom(1.6, true)).toBe(false); // 다음 칸으로 넘어가는 중 — 그대로
    expect(shouldResetZoom(1, false)).toBe(false);
    expect(shouldResetZoom(undefined, false)).toBe(false); // visualViewport 없는 브라우저
  });
});

describe('viewport meta', () => {
  it('maximum-scale=1 을 더하고, 이미 있으면 바꾼다', () => {
    expect(withMaxScale1('width=device-width, initial-scale=1.0, viewport-fit=cover')).toBe('width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1');
    expect(withMaxScale1('width=device-width, maximum-scale=5, initial-scale=1')).toBe('width=device-width, initial-scale=1, maximum-scale=1');
  });
});
