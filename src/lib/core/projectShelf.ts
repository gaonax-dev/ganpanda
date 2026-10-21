// 홈 프로젝트 목록 정리 (2026-10-21 사용자: "첫화면 리스트 아래에 폴딩으로 가린 정지, 완료 해당 일자가 6개월이 지난 프로젝트는 다시 연도별 폴딩")
// 정지·완료가 된 날(statusAt, 없으면 만든 날)이 6개월 넘게 지난 프로젝트는 "지난 프로젝트" 접힘 아래로, 그 안에서 연도별로 다시 접는다

export type ShelfStatus = 'waiting' | 'ongoing' | 'paused' | 'done';
export interface Shelvable { status: ShelfStatus; statusAt?: number; createdAt: number }

/** 상태가 된 날: 정지·완료로 바꾼 시각, 옛 데이터(시각 없음)는 만든 날 */
export const statusDate = (p: Shelvable) => p.statusAt ?? p.createdAt;

/** 6개월 전 (달력 기준) */
export function sixMonthsAgo(now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 6);
  return d.getTime();
}

/** 지난 프로젝트인가: 정지·완료 + 그날이 6개월 넘게 지남 */
export const isShelved = (p: Shelvable, now: number) => (p.status === 'paused' || p.status === 'done') && statusDate(p) < sixMonthsAgo(now);

export interface Shelf<T> { current: T[]; shelved: { year: number; projects: T[] }[]; shelvedCount: number }

/** 지금 보이는 것 / 연도별(최근 연도 먼저, 안에서는 최근 날짜 먼저) 접힌 것 */
export function splitShelf<T extends Shelvable>(projects: T[], now = Date.now()): Shelf<T> {
  const current: T[] = [], byYear = new Map<number, T[]>();
  for (const p of projects) {
    if (!isShelved(p, now)) { current.push(p); continue; }
    const y = new Date(statusDate(p)).getFullYear();
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(p);
  }
  const shelved = [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, ps]) => ({ year, projects: ps.sort((a, b) => statusDate(b) - statusDate(a)) }));
  return { current, shelved, shelvedCount: projects.length - current.length };
}
