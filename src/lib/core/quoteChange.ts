// 발행 견적 박제 · 계약 견적 대비 변경 · 고객 안전장치 (2026-10-26 사용자:
// "견적을 발행하고 다시 호출할땐 그간 원가 견적 금액이 변경되어도 이전에 발행 상태로 나와야한다. 만약 견적을 변경한다면 다시 발행하고 고객과 협의를 해야하고 고객이 거절하면 계약 견적으로 진행",
// "고객이 간판업체의 견적을 선택한 경우 해당 견적을 기준으로 이후 변경 견적의 차이를 쉽게 확인하는 시스템 … 새로운 제안과 변경이 고객에게 손해가 나거나 변경을 이해하지 못하게
//  복잡한 변경을 시스탬적으로 잡아내서 고객에게 안전장치").
// 발행본 = 관계 데이터(단가표·원가·배수)를 다시 계산하지 않는 값 그대로의 사본. 비교·위험 판정은 발행본끼리만 한다
import type { Approval, Snapshot, SnapshotItem } from './proposal';

export interface IssuedLine { key: string; objectId?: string; label: string; detail: string; amount: number; qty?: number; unit?: string; unitPrice?: number; cost?: number; priceId?: string }
/** 발행 견적 — 발행(제안 링크) 순간의 사인물 사양·견적 줄·합계 */
export interface IssuedQuote {
  id: string;
  /** 발행 번호 (1, 2, …) */
  no: number;
  at: number;
  by: string;
  note?: string;
  snapshot: Snapshot;
  lines: IssuedLine[];
  /** 발행 순간의 내용 해시 — 지금 내용과 같으면 "발행 그대로" */
  hash: string;
}

const LINE_KEYS = ['key', 'objectId', 'label', 'detail', 'amount', 'qty', 'unit', 'unitPrice', 'cost', 'priceId'] as const;
/** 박제본 만들기: 필요한 값만 깊은 복사 (원본·단가표를 나중에 고쳐도 그대로) */
export function issueOf(q: IssuedQuote): IssuedQuote {
  const lines = q.lines.map((l) => Object.fromEntries(LINE_KEYS.filter((k) => l[k] !== undefined).map((k) => [k, l[k]])) as unknown as IssuedLine);
  return { id: q.id, no: q.no, at: q.at, by: q.by, ...(q.note ? { note: q.note } : {}), snapshot: JSON.parse(JSON.stringify(q.snapshot)) as Snapshot, lines, hash: q.hash };
}

export type ItemField = 'size' | 'type' | 'category' | 'sheets' | 'options' | 'text' | 'design' | 'amount';
export interface FieldChange { field: ItemField; before: string | number; after: string | number }
export interface ItemChange { id: string; name: string; kind: 'added' | 'removed' | 'changed'; fields: FieldChange[]; amountDelta: number; before?: SnapshotItem; after?: SnapshotItem }
export interface UnitChange { priceId: string; label: string; before: number; after: number }
export interface QuoteDiff { items: ItemChange[]; unchanged: number; totalBefore: number; totalAfter: number; totalDelta: number; unitChanges: UnitChange[] }

const sizeStr = (i: SnapshotItem) => (i.size ? `${i.size.w}×${i.size.h}` : '');
const list = (a: string[]) => [...a].sort().join(', ');
const FIELDS: { field: ItemField; of: (i: SnapshotItem) => string | number }[] = [
  { field: 'size', of: sizeStr }, { field: 'type', of: (i) => i.type }, { field: 'category', of: (i) => i.category },
  { field: 'sheets', of: (i) => list(i.sheets) }, { field: 'options', of: (i) => list(i.options) },
  { field: 'text', of: (i) => i.text ?? '' }, { field: 'design', of: (i) => i.design ?? '' }, { field: 'amount', of: (i) => i.amount },
];

/** 기준(계약) 견적 → 변경 견적: 사인물별 추가·삭제·변경, 단가 항목별 단가 변화, 합계 차이 */
export function diffIssued(base: IssuedQuote, next: IssuedQuote): QuoteDiff {
  const b = new Map(base.snapshot.items.map((i) => [i.id, i])), n = new Map(next.snapshot.items.map((i) => [i.id, i]));
  const items: ItemChange[] = [];
  let unchanged = 0;
  for (const [id, x] of b) {
    const y = n.get(id);
    if (!y) { items.push({ id, name: x.name, kind: 'removed', fields: [], amountDelta: -x.amount, before: x }); continue; }
    const fields = FIELDS.filter((f) => f.of(x) !== f.of(y)).map((f) => ({ field: f.field, before: f.of(x), after: f.of(y) }));
    if (fields.length) items.push({ id, name: y.name, kind: 'changed', fields, amountDelta: y.amount - x.amount, before: x, after: y });
    else unchanged++;
  }
  for (const [id, y] of n) if (!b.has(id)) items.push({ id, name: y.name, kind: 'added', fields: [], amountDelta: y.amount, after: y });
  // 단가 항목별 단가 (같은 priceId 의 첫 줄)
  const unitOf = (q: IssuedQuote) => { const m = new Map<string, IssuedLine>(); for (const l of q.lines) if (l.priceId && l.unitPrice !== undefined && !m.has(l.priceId)) m.set(l.priceId, l); return m; };
  const ub = unitOf(base), un = unitOf(next);
  const unitChanges: UnitChange[] = [...ub].flatMap(([pid, l]) => { const m = un.get(pid); return m && m.unitPrice !== l.unitPrice ? [{ priceId: pid, label: m.label, before: l.unitPrice!, after: m.unitPrice! }] : []; });
  return { items, unchanged, totalBefore: base.snapshot.total, totalAfter: next.snapshot.total, totalDelta: next.snapshot.total - base.snapshot.total, unitChanges };
}

export type RiskLevel = 'danger' | 'warn' | 'info';
export type RiskCode = 'price-up-same-spec' | 'smaller-not-cheaper' | 'less-not-cheaper' | 'unit-up' | 'removed' | 'total-up' | 'complex';
export interface Risk { code: RiskCode; level: RiskLevel; itemId?: string; message: string }

/** 한 번에 이만큼 바뀌면 "복잡한 변경" — 고객이 하나씩 확인하게 */
export const COMPLEX_ITEMS = 4;
export const COMPLEX_FIELDS = 3;
const areaOf = (i?: SnapshotItem) => (i?.size ? i.size.w * i.size.h : null);
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/**
 * 고객 안전장치: 고객에게 손해이거나 이해하기 어려운 변경을 잡아낸다.
 * danger = 손해 가능(사양 그대로 금액 인상 · 작아졌거나 빠졌는데 금액이 줄지 않음), warn = 단가 인상·합계 인상·복잡한 변경, info = 항목 제외.
 * 고객에게 이로운 변경(더 크고 같은 금액, 금액 인하)은 잡지 않는다
 */
export function customerRisks(d: QuoteDiff): Risk[] {
  const out: Risk[] = [];
  for (const c of d.items) {
    if (c.kind === 'removed') { out.push({ code: 'removed', level: 'info', itemId: c.id, message: `"${c.name}"이(가) 견적에서 빠졌습니다 (${won(-c.amountDelta)}).` }); continue; }
    if (c.kind !== 'changed') continue;
    const spec = c.fields.filter((f) => f.field !== 'amount');
    if (!spec.length && c.amountDelta > 0) out.push({ code: 'price-up-same-spec', level: 'danger', itemId: c.id, message: `"${c.name}" — 사양은 그대로인데 금액이 ${won(c.amountDelta)} 올랐습니다.` });
    const a0 = areaOf(c.before), a1 = areaOf(c.after);
    if (a0 !== null && a1 !== null && a1 < a0 && c.amountDelta >= 0) out.push({ code: 'smaller-not-cheaper', level: 'danger', itemId: c.id, message: `"${c.name}" — 크기가 작아졌는데(${sizeStr(c.before!)} → ${sizeStr(c.after!)}) 금액은 ${c.amountDelta ? `${won(c.amountDelta)} 올랐습니다` : '그대로입니다'}.` });
    const lost = (c.before?.options ?? []).filter((o) => !(c.after?.options ?? []).includes(o));
    if (lost.length && c.amountDelta >= 0) out.push({ code: 'less-not-cheaper', level: 'danger', itemId: c.id, message: `"${c.name}" — ${lost.join(', ')}이(가) 빠졌는데 금액은 ${c.amountDelta ? `${won(c.amountDelta)} 올랐습니다` : '그대로입니다'}.` });
    if (spec.length >= COMPLEX_FIELDS) out.push({ code: 'complex', level: 'warn', itemId: c.id, message: `"${c.name}" — 한 번에 ${spec.length}가지가 바뀌었습니다. 하나씩 확인해 주세요.` });
  }
  for (const u of d.unitChanges) if (u.after > u.before) out.push({ code: 'unit-up', level: 'warn', message: `${u.label} 단가가 ${won(u.before)} → ${won(u.after)}로 올랐습니다.` });
  if (d.items.length >= COMPLEX_ITEMS) out.push({ code: 'complex', level: 'warn', message: `사인물 ${d.items.length}개가 한 번에 바뀌었습니다. 하나씩 확인해 주세요.` });
  if (d.totalDelta > 0) out.push({ code: 'total-up', level: 'warn', message: `합계가 ${won(d.totalBefore)} → ${won(d.totalAfter)}로 ${won(d.totalDelta)} 올랐습니다.` });
  return out;
}

/**
 * 고객이 보는 견적 (2026-10-26): 발행본만 보인다 — 발행 뒤 사장이 고친 내용은 다시 발행하기 전엔 고객에게 안 보인다.
 * contract = 마지막으로 동의한 발행본(계약 견적). 계약 뒤 더 새 발행본이 있으면 pending(변경 견적 — 계약과 비교해 동의·거절),
 * 그 변경 견적을 거절했으면 rejected 이고 보이는 것은 계약 견적. 발행본이 없으면 모두 null (옛 프로젝트 = 지금 내용 그대로)
 */
export function customerView(issues: IssuedQuote[], approvals: Approval[]): { shown: IssuedQuote | null; contract: IssuedQuote | null; pending: IssuedQuote | null; rejected: IssuedQuote | null } {
  const latest = issues.at(-1) ?? null;
  if (!latest) return { shown: null, contract: null, pending: null, rejected: null };
  const byId = new Map(issues.map((i) => [i.id, i]));
  const sorted = [...approvals].sort((a, b) => a.at - b.at);
  const agreed = sorted.filter((a) => a.decision !== 'rejected' && a.proposalId && byId.has(a.proposalId));
  const contract = agreed.length ? byId.get(agreed.at(-1)!.proposalId!)! : null;
  if (!contract || contract.id === latest.id) return { shown: latest, contract, pending: null, rejected: null };
  const rejectedLatest = sorted.some((a) => a.decision === 'rejected' && a.proposalId === latest.id);
  if (rejectedLatest) return { shown: contract, contract, pending: null, rejected: latest };
  return { shown: latest, contract, pending: latest.no > contract.no ? latest : null, rejected: null };
}
