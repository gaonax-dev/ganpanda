// D-day (2026-10-21 사용자: "날짜는 D-day 표시로 -숫자 지나면 +숫자 (그룹도)")
// 날짜는 'YYYY-MM-DD'(그 지역 자정) 또는 시각(ms). 오늘 기준 남은 날 → "D-3" · "D-day" · 지났으면 "D+5"

const DAY = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → 그 지역 자정 ms. 형식이 아니면 null */
export function parseDay(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

const midnight = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** 오늘 자정 → 대상 자정까지의 날 수 (음수 = 지남) */
export const daysUntil = (target: number, now: number) => Math.round((midnight(target) - midnight(now)) / DAY);

export function ddayLabel(days: number): string {
  return days > 0 ? `D-${days}` : days === 0 ? 'D-day' : `D+${-days}`;
}

export interface Dated { createdAt: number; contractDate?: string | null; startDate?: string | null; dueDate?: string | null; /** 정지·완료가 된 시각 — 날짜 칸이 없으면 이걸로 (며칠 지났나) */ status?: string; statusAt?: number }

/** 카드가 세는 기준일: 완료일 → 시작일 → 계약일 → (정지·완료면 그렇게 된 날) → 만든 날(그 뒤로 며칠 지났나) */
export function targetDay(p: Dated): { ms: number; kind: 'due' | 'start' | 'contract' | 'status' | 'created' } {
  const due = parseDay(p.dueDate), start = parseDay(p.startDate), contract = parseDay(p.contractDate);
  if (due !== null) return { ms: due, kind: 'due' };
  if (start !== null) return { ms: start, kind: 'start' };
  if (contract !== null) return { ms: contract, kind: 'contract' };
  if ((p.status === 'paused' || p.status === 'done') && p.statusAt) return { ms: p.statusAt, kind: 'status' };
  return { ms: p.createdAt, kind: 'created' };
}

export const TARGET_LABEL: Record<ReturnType<typeof targetDay>['kind'], string> = { due: '완료일', start: '시작일', contract: '계약일', status: '정지·완료한 날', created: '만든 날' };

/** 카드 D-day 글자와 설명 */
export function projectDday(p: Dated, now = Date.now()): { label: string; title: string; days: number } {
  const t = targetDay(p);
  const days = daysUntil(t.ms, now);
  return { label: ddayLabel(days), title: `${TARGET_LABEL[t.kind]} ${new Date(t.ms).toLocaleDateString('ko-KR')} 기준`, days };
}

/** 그룹: 프로젝트 중 가장 가까운(남은 날이 가장 적은, 지난 것보다 앞으로 올 것 우선) 기준일. 프로젝트가 없으면 그룹 만든 날 */
export function groupDday(projects: Dated[], createdAt: number, now = Date.now()): { label: string; title: string; days: number } {
  if (!projects.length) return projectDday({ createdAt }, now);
  const all = projects.map((p) => projectDday(p, now));
  const upcoming = all.filter((d) => d.days >= 0).sort((a, b) => a.days - b.days);
  return upcoming[0] ?? all.sort((a, b) => b.days - a.days)[0];
}
