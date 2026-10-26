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

// 2026-10-27 사용자: "리스트 아래에 외주, 정지, 완료 순으로 메인 구성해주고 정지 완료 처리하면 이동하게 해줘 그리고 개수는 당구공으로 표시"
import { homeFolders } from '../../src/lib/core/projectShelf';
describe('홈 폴더: 진행 목록 아래 외주 · 정지 · 완료', () => {
  it('정지·완료는 바로 그 폴더로(외주였어도), 외주 폴더는 진행 중인 외주만, 폴더 안은 최근 순 + 6개월 지난 것은 연도별', () => {
    const ps = [
      { id: 'run', status: 'ongoing' as const, createdAt: at('2026-10-01') },
      { id: 'wait', status: 'waiting' as const, createdAt: at('2026-10-02') },
      { id: 'out', status: 'ongoing' as const, outsource: true, createdAt: at('2026-10-03') },
      { id: 'outDone', status: 'done' as const, outsource: true, statusAt: at('2026-10-10'), createdAt: 0 },
      { id: 'p1', status: 'paused' as const, statusAt: at('2026-10-05'), createdAt: 0 },
      { id: 'p2', status: 'paused' as const, statusAt: at('2026-10-15'), createdAt: 0 },
      { id: 'pOld', status: 'paused' as const, statusAt: at('2025-01-01'), createdAt: 0 },
      { id: 'd1', status: 'done' as const, statusAt: at('2026-09-01'), createdAt: 0 },
      { id: 'dOld', status: 'done' as const, statusAt: at('2024-03-01'), createdAt: 0 },
    ];
    const f = homeFolders(ps, NOW);
    expect(f.main.map((p) => p.id)).toEqual(['run', 'wait']);
    expect(f.outsource.map((p) => p.id)).toEqual(['out']);
    expect(f.paused.count).toBe(3);
    expect(f.paused.recent.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(f.paused.years.map((y) => [y.year, y.projects.map((p) => p.id)])).toEqual([[2025, ['pOld']]]);
    expect(f.done.count).toBe(3);
    expect(f.done.recent.map((p) => p.id)).toEqual(['outDone', 'd1']);
    expect(f.done.years.map((y) => y.year)).toEqual([2024]);
  });
});
