// 6차 "한 장으로 결정하기": 제안 링크 + 승인 (2026-10-14)
// 제안 = 사진마다 만든 실사 이미지(주간·야간 에셋) + 그 시점의 내용 해시. 승인 = 고객이 [이걸로 할게요] 한 시점의 스냅샷(사인물·치수·디자인·금액)과 이름·시각.
// 내용이 바뀌면 해시가 달라져 "변경됨 — 재승인 필요"가 된다.
import { isPreviewPart, partLabel, partsOf, signTextOf } from './parts';
import { componentOf } from './components';
import { stackLabel } from './stack';
import { categoryOf, CATEGORY_GROUPS, productById, sheetById } from './catalog';
import type { DesignSource, SignObject } from './model';
import { describeOptions } from './options';
import type { Quote } from './quote';

export interface ProposalRender { photoId: string; day: string; night: string }
export interface ProposalInfo {
  id: string;
  createdAt: number;
  author: string;
  renders: ProposalRender[];
  /** 만들 때의 내용 해시 (참고용) */
  hash: string;
  /** 고객에게 보일 한마디 */
  note?: string;
}

export interface SnapshotItem {
  id: string; name: string; category: string; type: string; sheets: string[]; options: string[];
  size?: { w: number; h: number; estimated: boolean }; text?: string; design?: string; amount: number;
  /** 구성 요약 — 구성 요소·재료 층·두께·글자·그림 (2026-11-05 고객 컨펌 기준선). 옛 박제본에는 없음 → 비교하지 않는다 */
  parts?: string;
}
export interface Snapshot { items: SnapshotItem[]; subtotal: number; vat: number; total: number; vatIncluded: boolean; /** 사인물마다 내용 지문 (2026-10-22 사인물별 컨펌) — 옛 동의에는 없음 */ signHashes?: Record<string, string> }

export interface Approval {
  id: string;
  at: number;
  /** 승인자 이름 */
  by: string;
  /** 승인 시점의 내용 해시 */
  hash: string;
  snapshot: Snapshot;
  /** 승인 당시의 제안 id (있으면) */
  proposalId?: string;
  /** 진행 동의에서 뺀 사인물 (2026-10-22) */
  excluded?: string[];
  /** 'rejected' = 변경 견적 거절 — 계약 견적대로 진행 (2026-10-26). 없으면 동의 */
  decision?: 'rejected';
}

type SizeOf = (o: SignObject) => { w: number; h: number; estimated: boolean } | null;

/** 승인 대상 내용: 사인물의 규격·치수·디자인·금액. 순서·불필요 필드와 무관하게 같은 내용이면 같은 문자열 */
export function canonicalContent(signs: SignObject[], sizeOf: SizeOf, quote: Quote): string {
  const items = [...signs].sort((a, b) => a.id.localeCompare(b.id)).map((o) => {
    const sz = sizeOf(o);
    return {
      id: o.id, name: o.name, p: o.productId ?? null, s: [...o.sheetIds].sort(), opt: o.options ?? {}, t: o.text ?? null,
      w: sz ? Math.round(sz.w) : null, h: sz ? Math.round(sz.h) : null, dp: o.depthMm ?? null, corner: o.corner ?? null,
      d: o.design ? `${o.design.sourceId}/${o.design.page}/${o.design.crop.x},${o.design.crop.y},${o.design.crop.w},${o.design.crop.h}` : null,
      amt: quote.lines.filter((l) => l.objectId === o.id).reduce((a, l) => a + l.amount, 0),
    };
  });
  return JSON.stringify({ items, total: quote.total, vat: quote.vatIncluded });
}

/** FNV-1a 32비트 (동기, 짧음) — 변경 감지용이지 보안용이 아니다 */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const contentHash = (signs: SignObject[], sizeOf: SizeOf, quote: Quote) => fnv1a(canonicalContent(signs, sizeOf, quote));

export function snapshotOf(signs: SignObject[], sizeOf: SizeOf, quote: Quote, sources: DesignSource[]): Snapshot {
  const items: SnapshotItem[] = signs.map((o) => {
    const cat = categoryOf(o), p = productById(o.productId), sz = sizeOf(o);
    const src = o.design && sources.find((s) => s.id === o.design!.sourceId);
    return {
      id: o.id, name: o.name,
      category: cat ? CATEGORY_GROUPS.find((g) => g.id === cat)!.label : '미분류',
      type: p?.name ?? (o.sheetIds.length ? '시트' : ''),
      sheets: o.sheetIds.map((id) => sheetById(id)?.name ?? id),
      options: describeOptions(o, { defaults: true }),
      ...(sz ? { size: { w: Math.round(sz.w), h: Math.round(sz.h), estimated: sz.estimated } } : {}),
      ...(signTextOf(o) ? { text: signTextOf(o) } : {}), // 문구가 없으면 구성내역 (2026-10-16)
      ...(src ? { design: `${src.name} (${o.design!.page + 1}쪽)` } : {}),
      amount: quote.lines.filter((l) => l.objectId === o.id).reduce((a, l) => a + l.amount, 0),
      ...(() => { const s = partsSummary(o); return s ? { parts: s } : {}; })(),
    };
  });
  return { items, subtotal: quote.subtotal, vat: quote.vat, total: quote.total, vatIncluded: quote.vatIncluded };
}

/** 그릴 구성 요소 (미리보기 출력 시트 제외) */
const realParts = (o: SignObject) => partsOf(o).filter((p) => !isPreviewPart(p));
const layersOf = (p: ReturnType<typeof partsOf>[number], o: SignObject) => componentOf(p.kind).stack?.(p, o) ?? p.stack ?? [];
/**
 * 사인물 구성 요약 (2026-11-05 사용자: "디자이너가 고객과 소통하면서 변경을 할 때도 있어 고객이 컨펌한 내역으로 진행하는게 깔끔한데 변경사항을 같이 공유하면 좋겠다"):
 * 구성 요소마다 "이름: 재료 층 · 글자 · 그림" — 바뀐 내용 비교(구성)에 그대로 보인다. 그림은 파일이 바뀌면 달라지게 짧은 id
 */
export function partsSummary(o: SignObject): string {
  return realParts(o).map((p) => {
    const st = layersOf(p, o);
    const items = p.items.map((it) => it.kind === 'text' ? `“${(it.text ?? '').trim()}”` : it.kind === 'image' ? `${it.vector ? '벡터' : '그림'}#${(it.image && 'assetId' in it.image ? it.image.assetId : it.image ? `${it.image.sourceId}/${it.image.page}` : '').slice(0, 6)}` : it.shape ?? '도형').filter((x) => x !== '“”');
    return [partLabel(p) + (st.length ? `: ${stackLabel(st)}` : ''), ...items].join(' · ');
  }).join(' / ');
}
/** 구성 지문 — 사인물들의 구성 요소·재료 층·내용 객체(자리·크기 포함). 사인물 자리(quad·listX)는 빼서 옮겨도 그대로 */
export function partsHash(signs: SignObject[]): string {
  return fnv1a(JSON.stringify([...signs].sort((a, b) => a.id.localeCompare(b.id)).map((o) => [o.id, realParts(o).map((p) => ({
    k: p.kind, t: p.type, opt: p.options ?? {}, on: p.on ?? null, st: p.stack ?? null,
    it: p.items.map((i) => [i.kind, i.text ?? null, i.shape ?? null, i.image ?? null, i.vector ?? null, Math.round(i.x), Math.round(i.y), Math.round(i.h), Math.round(i.w ?? 0)]),
  }))])));
}

export type ApprovalState =
  | { status: 'none' }
  | { status: 'approved'; approval: Approval }
  | { status: 'changed'; approval: Approval };

/** 최신 승인과 현재 내용 해시를 비교 */
export function approvalState(approvals: Approval[] | undefined, currentHash: string): ApprovalState {
  const agreed = (approvals ?? []).filter((a) => a.decision !== 'rejected'); // 거절 기록은 동의가 아니다 (2026-10-26)
  if (!agreed.length) return { status: 'none' };
  const latest = [...agreed].sort((a, b) => b.at - a.at)[0];
  return latest.hash === currentHash ? { status: 'approved', approval: latest } : { status: 'changed', approval: latest };
}

/** 제안을 만들 수 있나: 비어 있으면 안내 문구 목록 (비어 있지 않으면 만들 수 없음) */
/** 제안 준비 점검. 3D(원근)는 묻지 않는다 — 실사 이미지를 만들지 않고 링크만 발급 (2026-10-24 "실사이미지 만들필요가 없고 링크발급으로") */
export function proposalProblems(signs: SignObject[], sizeOf: SizeOf, photos: { id: string }[]): string[] {
  const out: string[] = [];
  if (!photos.length) out.push('사진이 없습니다.');
  if (!signs.length) out.push('사인물이 없습니다. 사진에 사인물 영역을 그리세요.');
  for (const o of signs) {
    if (!categoryOf(o)) out.push(`"${o.name}"의 분류(간판·스카시·시트)가 없습니다.`);
    if (!sizeOf(o)) out.push(`"${o.name}"의 치수가 없습니다 (입력 또는 원근 맞추기로 추정).`);
  }
  return [...new Set(out)];
}

/**
 * 사인물마다 컨펌 (2026-10-22 사용자: "컨펌에 정면도 사인물 카드에 컨펌이 있어야한다. 현재방식은 대상을 파악하기 어렵다. 사인물마다. 고객과 맴버 컨펌"):
 * 사인물 하나의 내용 지문 — 종류·옵션·문구·크기·디자인·구성 요소(parts)·그 사인물 금액. 자리(listX/listY)·말풍선은 빼서 옮겨도 그대로
 */
export function signHash(o: SignObject, size: { w: number; h: number } | null, amount: number): string {
  return fnv1a(JSON.stringify({
    id: o.id, name: o.name, p: o.productId ?? null, s: [...o.sheetIds].sort(), opt: o.options ?? {}, t: o.text ?? null,
    w: size ? Math.round(size.w) : null, h: size ? Math.round(size.h) : null, dp: o.depthMm ?? null, corner: o.corner ?? null,
    d: o.design ? `${o.design.sourceId}/${o.design.page}/${o.design.crop.x},${o.design.crop.y},${o.design.crop.w},${o.design.crop.h}` : null,
    parts: o.parts ?? null, amt: amount,
  }));
}
