// 디자인 싱크 받기 검토 (2026-11-06 사용자: "받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요").
// 받은 파일을 바로 입히지 않고, 사인물마다 상태(연결·바뀜·새로 생김·누락)와 처리를 정해 보드에서 확인한 뒤 [확정]. → docs/features/design-sync.md
import { matchArtboards } from './illustrator';

/** link = 디자인 없던 사인물에 연결, update = 기존 디자인을 바꿈, new = 파일에만 있음, missing = 보낸 사인물인데 파일에 없음 */
export type SyncStatus = 'link' | 'update' | 'new' | 'missing';
/** apply = 입히기, keep = 기존 그대로, create = 새 사인물(사진 없는 카드)로, skip = 건너뜀, unlink = 기존 디자인 연결 해제 */
export type SyncAction = 'apply' | 'keep' | 'create' | 'skip' | 'unlink';
export const SYNC_ACTIONS: Record<SyncStatus, SyncAction[]> = { link: ['apply', 'skip'], update: ['apply', 'keep'], new: ['create', 'skip'], missing: ['keep', 'unlink'] };
export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = { link: '연결', update: '바뀜', new: '새로 생김', missing: '누락' };
export const SYNC_ACTION_LABEL: Record<SyncAction, string> = { apply: '입히기', keep: '기존 유지', create: '새 사인물로', skip: '건너뛰기', unlink: '연결 해제' };

export interface SyncRow {
  key: string;
  status: SyncStatus;
  action: SyncAction;
  /** 고를 수 있는 처리 (첫째가 기본) */
  actions: SyncAction[];
  signId?: string;
  /** 대지(페이지) 순번 */
  page?: number;
  /** 새 사인물 실물 크기(mm) */
  w?: number; h?: number;
  /** 묶음: 받은 구성 요소(frame = 바탕) */
  parts?: string[];
}

const row = (r: Omit<SyncRow, 'actions' | 'action'> & { action?: SyncAction; actions?: SyncAction[] }): SyncRow => {
  const actions = r.actions ?? SYNC_ACTIONS[r.status];
  return { ...r, actions, action: r.action ?? actions[0] };
};
const SCALES = [1, 0.1, 0.01];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/**
 * 대지(페이지 mm) ↔ 사인물. signs = 보낸(치수 있는) 사인물.
 * 짝 정보(XMP, 대지 수와 같을 때)가 있으면 짝대로 — 짝 없는·지워진·겹친 대지는 새로 생김(새 사인물로), 파일에 없는 사인물은 누락(기존 유지).
 * 없으면 크기로 — 우연히 맞은 기존 디자인은 기본 '기존 유지', 남는 대지는 기본 '건너뛰기', 누락은 따지지 않는다
 */
export function planArtboards(pages: { w: number; h: number }[], ids: (string | null)[] | null, signs: { id: string; w: number; h: number; hasDesign: boolean }[]): SyncRow[] {
  const byXmp = !!ids && ids.length === pages.length;
  const known = new Map(signs.map((s) => [s.id, s]));
  const pairs: { page: number; id: string }[] = [];
  if (byXmp) {
    const used = new Set<string>();
    ids!.forEach((id, page) => { if (id && known.has(id) && !used.has(id)) { used.add(id); pairs.push({ page, id }); } });
  } else pairs.push(...matchArtboards(pages, signs, null));
  // 축척: 짝지은 대지/실물의 가운데 값에 가장 가까운 1·1/10·1/100
  const ratio = pairs.length ? median(pairs.map(({ page, id }) => pages[page].w / Math.max(1e-6, known.get(id)!.w))) : 1;
  const k = SCALES.reduce((b, s) => (Math.abs(Math.log(s / ratio)) < Math.abs(Math.log(b / ratio)) ? s : b), 1);
  const rows: SyncRow[] = [];
  const paired = new Map(pairs.map((p) => [p.page, p.id]));
  pages.forEach((p, page) => {
    const id = paired.get(page);
    if (id) {
      const s = known.get(id)!;
      rows.push(row({ key: `p${page}`, status: s.hasDesign ? 'update' : 'link', signId: id, page, ...(s.hasDesign && !byXmp ? { action: 'keep' as const } : {}) }));
    } else rows.push(row({ key: `p${page}`, status: 'new', page, w: Math.round(p.w / k), h: Math.round(p.h / k), ...(byXmp ? {} : { action: 'skip' as const }) }));
  });
  if (byXmp) {
    const got = new Set(pairs.map((p) => p.id));
    for (const s of signs) if (!got.has(s.id)) rows.push(row({ key: `m${s.id}`, status: 'missing', signId: s.id }));
  }
  return rows;
}

/** 구성 요소 묶음 ↔ 사인물: 사인물별로, 없는 구성 요소는 빼고. 간판다에 없는 사인물은 새로 생김(건너뛰기만), 묶음에 없는 사인물은 누락 */
export function planBundle(items: { sign: string; part: string }[], signs: { id: string; parts: string[]; hasDesign: boolean }[]): SyncRow[] {
  const known = new Map(signs.map((s) => [s.id, s]));
  const bySign = new Map<string, string[]>();
  for (const it of items) bySign.set(it.sign, [...(bySign.get(it.sign) ?? []), it.part]);
  const rows: SyncRow[] = [];
  for (const [id, parts] of bySign) {
    const s = known.get(id);
    if (!s) { rows.push(row({ key: `b${id}`, status: 'new', signId: id, parts, actions: ['skip'] })); continue; }
    const ok = parts.filter((p) => p === 'frame' || s.parts.includes(p));
    if (!ok.length) continue;
    rows.push(row({ key: `b${id}`, status: s.hasDesign ? 'update' : 'link', signId: id, parts: ok }));
  }
  for (const s of signs) if (!bySign.has(s.id)) rows.push(row({ key: `m${s.id}`, status: 'missing', signId: s.id }));
  return rows;
}
