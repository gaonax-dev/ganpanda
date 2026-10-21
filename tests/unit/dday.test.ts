// D-day 표시 (2026-10-21 "날짜는 D-day 표시로 -숫자 지나면 +숫자 (그룹도)")
import { describe, expect, it } from 'vitest';
import { ddayLabel, daysUntil, groupDday, parseDay, projectDday, targetDay } from '../../src/lib/core/dday';

const NOW = new Date(2026, 9, 21, 15, 30).getTime(); // 2026-10-21 15:30 (지역)
const day = (s: string) => parseDay(s)!;

describe('D-day', () => {
  it('오늘 자정 기준 날 수: 앞이면 D-n, 오늘이면 D-day, 지났으면 D+n', () => {
    expect(daysUntil(day('2026-10-24'), NOW)).toBe(3);
    expect(daysUntil(day('2026-10-21'), NOW)).toBe(0);
    expect(daysUntil(day('2026-10-16'), NOW)).toBe(-5);
    expect(ddayLabel(3)).toBe('D-3'); expect(ddayLabel(0)).toBe('D-day'); expect(ddayLabel(-5)).toBe('D+5');
  });
  it('YYYY-MM-DD 만 읽는다', () => {
    expect(parseDay('2026-10-24')).toBe(new Date(2026, 9, 24).getTime());
    expect(parseDay('2026/10/24')).toBeNull(); expect(parseDay('')).toBeNull(); expect(parseDay(undefined)).toBeNull();
  });
  it('기준일: 완료일 → 시작일 → 계약일 → 만든 날', () => {
    expect(targetDay({ createdAt: 1, dueDate: '2026-10-24', startDate: '2026-10-01' }).kind).toBe('due');
    expect(targetDay({ createdAt: 1, startDate: '2026-10-01', contractDate: '2026-09-01' }).kind).toBe('start');
    expect(targetDay({ createdAt: 1, contractDate: '2026-09-01' }).kind).toBe('contract');
    expect(targetDay({ createdAt: 1 }).kind).toBe('created');
    expect(targetDay({ createdAt: 1, status: 'done', statusAt: 5 })).toEqual({ ms: 5, kind: 'status' }); // 정지·완료한 날
    expect(targetDay({ createdAt: 1, status: 'ongoing', statusAt: 5 }).kind).toBe('created');
    expect(projectDday({ createdAt: NOW - 2 * 86400000 }, NOW).label).toBe('D+2'); // 만든 지 이틀
    expect(projectDday({ createdAt: 1, dueDate: '2026-10-24' }, NOW)).toMatchObject({ label: 'D-3', days: 3 });
    expect(projectDday({ createdAt: 1, dueDate: '2026-10-24' }, NOW).title).toContain('완료일');
  });
  it('그룹: 앞으로 올 기준일 중 가장 가까운 것, 다 지났으면 가장 최근에 지난 것, 없으면 그룹 만든 날', () => {
    expect(groupDday([{ createdAt: 1, dueDate: '2026-10-30' }, { createdAt: 1, dueDate: '2026-10-24' }, { createdAt: 1, dueDate: '2026-10-01' }], 1, NOW).label).toBe('D-3');
    expect(groupDday([{ createdAt: 1, dueDate: '2026-10-01' }, { createdAt: 1, dueDate: '2026-10-11' }], 1, NOW).label).toBe('D+10');
    expect(groupDday([], NOW - 86400000, NOW).label).toBe('D+1');
  });
});
