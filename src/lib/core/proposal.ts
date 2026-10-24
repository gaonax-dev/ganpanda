// 6차 "한 장으로 결정하기": 제안 링크 + 승인 (2026-10-14)
// 제안 = 사진마다 만든 실사 이미지(주간·야간 에셋) + 그 시점의 내용 해시. 승인 = 고객이 [이걸로 할게요] 한 시점의 스냅샷(사인물·치수·디자인·금액)과 이름·시각.
// 내용이 바뀌면 해시가 달라져 "변경됨 — 재승인 필요"가 된다.
import { signTextOf } from './parts';
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
    };
  });
  return { items, subtotal: quote.subtotal, vat: quote.vat, total: quote.total, vatIncluded: quote.vatIncluded };
}

export type ApprovalState =
  | { status: 'none' }
  | { status: 'approved'; approval: Approval }
  | { status: 'changed'; approval: Approval };

/** 최신 승인과 현재 내용 해시를 비교 */
export function approvalState(approvals: Approval[] | undefined, currentHash: string): ApprovalState {
  if (!approvals?.length) return { status: 'none' };
  const latest = [...approvals].sort((a, b) => b.at - a.at)[0];
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
