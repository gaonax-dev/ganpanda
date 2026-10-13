import { describe, expect, it } from 'vitest';
import { formatBytes } from '../../src/lib/core/format';

describe('용량 표시', () => {
  it('단위 자동 선택, 소수 한 자리(정수면 생략)', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
    expect(formatBytes(1234567)).toBe('1.2 MB');
  });
});
