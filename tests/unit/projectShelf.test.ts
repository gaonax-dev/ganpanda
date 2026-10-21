// 홈 목록: 정지·완료 6개월 지난 프로젝트는 접고, 그 안에서 연도별로 (2026-10-21)
import { describe, expect, it } from 'vitest';
import { isShelved, sixMonthsAgo, splitShelf } from '../../src/lib/core/projectShelf';

const NOW = new Date('2026-10-21T00:00:00+09:00').getTime();
const day = 24 * 3600 * 1000;
const at = (iso: string) => new Date(iso).getTime();

describe('지난 프로젝트 판정', () => {
  it('정지·완료가 된 날이 6개월(달력) 넘게 지났을 때만', () => {
    expect(sixMonthsAgo(NOW)).toBe(at('2026-04-21T00:00:00+09:00'));
    expect(isShelved({ status: 'done', statusAt: at('2026-04-20T00:00:00+09:00'), createdAt: 0 }, NOW)).toBe(true);
    expect(isShelved({ status: 'paused', statusAt: at('2026-04-22T00:00:00+09:00'), createdAt: 0 }, NOW)).toBe(false);
    expect(isShelved({ status: 'ongoing', statusAt: at('2020-01-01'), createdAt: 0 }, NOW)).toBe(false); // 진행 중은 아무리 오래돼도 보인다
    expect(isShelved({ status: 'waiting', createdAt: at('2020-01-01') }, NOW)).toBe(false);
  });
  it('상태 시각이 없는 옛 데이터는 만든 날로', () => {
    expect(isShelved({ status: 'done', createdAt: NOW - 200 * day }, NOW)).toBe(true);
    expect(isShelved({ status: 'done', createdAt: NOW - 10 * day }, NOW)).toBe(false);
  });
});

describe('나누기', () => {
  it('보이는 것 / 연도별(최근 연도 먼저, 안에서 최근 날짜 먼저)', () => {
    const ps = [
      { id: 'a', status: 'ongoing' as const, createdAt: at('2024-01-01') },
      { id: 'b', status: 'done' as const, statusAt: at('2025-03-01'), createdAt: 0 },
      { id: 'c', status: 'paused' as const, statusAt: at('2024-11-01'), createdAt: 0 },
      { id: 'd', status: 'done' as const, statusAt: at('2025-08-01'), createdAt: 0 },
      { id: 'e', status: 'done' as const, statusAt: at('2026-09-01'), createdAt: 0 }, // 최근 → 보임
    ];
    const s = splitShelf(ps, NOW);
    expect(s.current.map((p) => p.id)).toEqual(['a', 'e']);
    expect(s.shelvedCount).toBe(3);
    expect(s.shelved.map((y) => [y.year, y.projects.map((p) => p.id)])).toEqual([[2025, ['d', 'b']], [2024, ['c']]]);
  });
});
