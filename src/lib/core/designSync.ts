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
  /** 묶음: 디자인(대지 이미지) 있음 */
  design?: boolean;
  /** 묶음: 받은 디자인이 빈(투명) 이미지라 넣지 않음 */
  designBlank?: boolean;
  /** 묶음: path(입체용 벡터) 있음 — pathPart = 연결할 구성물 id('' = 아직 안 고름), pathParts = 고를 수 있는 입체 구성 요소 */
  path?: boolean; pathPart?: string; pathParts?: string[];
  /** 예전 묶음: 구성 요소 id 로 온 것 */
  parts?: string[];
  /** PDF 대지 페이지의 레이어 (벡터·글자가 있는 것) · 레이어 → 연결할 구성물 id('' = 안 씀) */
  layers?: PageLayer[]; layerParts?: Record<string, string>;
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
/** PDF 페이지(대지)의 레이어 (core/pdfVectors) — paths = 채운 경로 수, texts = 윤곽선 아닌 글자 수 */
export interface PageLayer { name: string; paths: number; texts: number }
/** 레이어 이름으로 구성물 미리 고르기: 구성물 이름이 들어 있으면 그것, "채널"·"스카시"가 들어 있으면 그 종류의 첫 구성물, 아니면 '' (2026-11-07 "레이어로 고르기") */
export function defaultLayerPart(layer: string, parts: { id: string; kind: string; label: string }[]): string {
  const byLabel = parts.find((p) => p.label && layer.includes(p.label));
  if (byLabel) return byLabel.id;
  for (const [word, kind] of [['채널', 'channel'], ['체널', 'channel'], ['스카시', 'scashi']] as const) if (layer.includes(word)) return parts.find((p) => p.kind === kind)?.id ?? '';
  return '';
}
export function planArtboards(pages: { w: number; h: number }[], ids: (string | null)[] | null, signs: { id: string; w: number; h: number; hasDesign: boolean; parts?: { id: string; kind: string; label: string }[] }[], pageInfo?: ({ layers: PageLayer[]; blank?: boolean } | undefined)[]): SyncRow[] {
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
      // PDF 레이어 (2026-11-07): 벡터·글자가 있는 레이어 → 구성물(입체) 고르기, 빈 페이지면 디자인을 넣지 않음
      const info = pageInfo?.[page];
      const layers = info ? info.layers.filter((l) => l.paths > 0 || l.texts > 0) : [];
      const parts = s.parts ?? [];
      const extra = info ? { layers, layerParts: Object.fromEntries(layers.map((l) => [l.name, l.paths > 0 ? defaultLayerPart(l.name, parts) : ''])), pathParts: parts.map((p) => p.id), ...(info.blank ? { designBlank: true } : {}) } : {};
      const nothing = !!info?.blank && !layers.some((l) => l.paths > 0);
      rows.push(row({ key: `p${page}`, status: s.hasDesign ? 'update' : 'link', signId: id, page, ...extra, ...(nothing ? { action: 'skip' as const } : s.hasDesign && !byXmp ? { action: 'keep' as const } : {}) }));
    } else rows.push(row({ key: `p${page}`, status: 'new', page, w: Math.round(p.w / k), h: Math.round(p.h / k), ...(byXmp ? {} : { action: 'skip' as const }) }));
  });
  if (byXmp) {
    const got = new Set(pairs.map((p) => p.id));
    for (const s of signs) if (!got.has(s.id)) rows.push(row({ key: `m${s.id}`, status: 'missing', signId: s.id }));
  }
  return rows;
}

/**
 * 일러스트 묶음 ↔ 사인물 (2026-11-06 정의 "디자인은 대지 이름별로 이미지로 변환해 사인물 카드에 바로 적용한다. path는 대지 이름을 통해 사인물을 찾고 해당 구성물의 path에 사용자가 연결한다"):
 * 사인물(대지 이름의 #id)별 한 줄 — design = 바탕 디자인으로 입힘, path = 고른 구성물(pathPart, 입체 구성 요소 하나면 그것)의 벡터.
 * 간판다에 없는 사인물은 새로 생김(건너뛰기만), 묶음에 없는 사인물은 누락. 예전 묶음(frame = 디자인, 구성 요소 id = 그 구성 요소)도 읽는다
 */
export function planBundle(items: { sign: string; part: string; blank?: boolean }[], signs: { id: string; hasDesign: boolean; pathParts: string[]; parts?: string[] }[]): SyncRow[] {
  const known = new Map(signs.map((s) => [s.id, s]));
  const bySign = new Map<string, string[]>();
  for (const it of items) bySign.set(it.sign, [...(bySign.get(it.sign) ?? []), it.blank ? 'design:blank' : it.part]);
  const rows: SyncRow[] = [];
  for (const [id, got] of bySign) {
    const s = known.get(id);
    if (!s) { rows.push(row({ key: `b${id}`, status: 'new', signId: id, actions: ['skip'] })); continue; }
    const design = got.includes('design') || got.includes('frame'), path = got.includes('path');
    // 빈(투명) 디자인 — 넣지 않고 알린다 (2026-11-07 핀볼: 일러스트 좌표 문제로 받은 디자인이 모두 투명이었다)
    const designBlank = !design && got.includes('design:blank');
    const legacy = got.filter((p) => p !== 'design' && p !== 'frame' && p !== 'path' && p !== 'design:blank' && (s.parts ?? s.pathParts).includes(p));
    if (!design && !path && !legacy.length && !designBlank) continue;
    rows.push(row({ key: `b${id}`, status: design && s.hasDesign ? 'update' : 'link', signId: id, design, path, ...(designBlank ? { designBlank } : {}), ...(!design && !path && !legacy.length ? { action: 'skip' as const } : {}), ...(path ? { pathParts: s.pathParts, pathPart: s.pathParts.length === 1 ? s.pathParts[0] : '' } : {}), ...(legacy.length ? { parts: legacy } : {}) }));
  }
  for (const s of signs) if (!bySign.has(s.id)) rows.push(row({ key: `m${s.id}`, status: 'missing', signId: s.id }));
  return rows;
}
