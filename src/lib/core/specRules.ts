// 사양 글 개인 사전 (2026-10-18 V1, docs/features/spec-vocabulary.md): 퀵입력이 못 알아본 말에 사용자가 답한 뜻을 규칙으로 두고,
// 다음부터는 기본 사전보다 **먼저**(긴 말부터) 맞춘다. 뜻은 확인 창 항목(SpecItem)들 — 레지스트리의 값에서 고른다(meaningChoices).
import type { SpecItem } from './specText';
import type { SignObject } from './model';
import type { ColorCard } from './colorLibrary';
import { CATEGORY_GROUPS, CHANNEL_OPTIONS, productById, productsOf } from './catalog';
import { NAMED_COLORS } from './materials';
import { optionGroupsFor, partOptionFields } from './options';
import { newPart } from './parts';
import { ledLabel } from './quickSpec';

export interface SpecRule { phrase: string; meaning: SpecItem[] }
export type Meaning = Exclude<SpecItem, { kind: 'note' }>;

export const normPhrase = (p: string) => p.trim().replace(/\s+/g, ' ');
export const PHRASE_MAX = 60;
export function validRule(r: SpecRule): boolean {
  const p = normPhrase(r.phrase);
  return !!p && p.length <= PHRASE_MAX && Array.isArray(r.meaning) && r.meaning.length > 0 && r.meaning.length <= 10 && r.meaning.every((m) => m.kind !== 'note');
}
/** 뜻의 비교 키 (라벨 제외) — 같은 뜻 묶기·중복 방지 */
export const meaningKey = (items: SpecItem[]) => JSON.stringify(items.map(({ label: _l, ...rest }) => Object.fromEntries(Object.entries(rest).sort())));

/** 글에서 내 규칙의 말을 먼저 찾아 그 뜻을 항목으로, 남은 글을 돌려준다. 긴 말부터, 한 규칙은 한 번 */
export function matchRules(text: string, rules: SpecRule[]): { items: SpecItem[]; rest: string } {
  const items: SpecItem[] = [];
  let rest = text;
  for (const r of [...rules].filter(validRule).sort((a, b) => b.phrase.length - a.phrase.length)) {
    const p = normPhrase(r.phrase);
    const at = rest.indexOf(p);
    if (at < 0) continue;
    items.push(...r.meaning.map((m) => ({ ...m, label: `${m.label} (내 사전: ${p})` }) as SpecItem));
    rest = `${rest.slice(0, at)} ${rest.slice(at + p.length)}`;
  }
  return { items, rest: rest.replace(/\s+/g, ' ').trim() };
}

export interface MeaningChoice { group: string; id: string; label: string; item: Meaning }
/** 뜻으로 고를 수 있는 것 — 레지스트리·카탈로그에서: 종류 · 채널 · LED · 몸통 색 · 채널 색 · 몸통 옵션 값 · 채널 옵션 값 */
export function meaningChoices(o: SignObject, library: ColorCard[] = []): MeaningChoice[] {
  const out: MeaningChoice[] = [];
  for (const g of CATEGORY_GROUPS) for (const p of productsOf(g.id)) out.push({ group: '종류', id: `product:${p.id}`, label: p.name, item: { kind: 'product', id: p.id, label: `몸통: ${p.name}` } });
  for (const c of CHANNEL_OPTIONS) out.push({ group: '채널', id: `channel:${c.id}`, label: c.label, item: { kind: 'channel', id: c.id, label: `채널: ${c.label}` } });
  for (const v of ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB']) out.push({ group: 'LED', id: `led:${v}`, label: ledLabel(v), item: { kind: 'led', value: v, label: `LED: ${ledLabel(v)}` } });
  const colors = [...library.map((c) => ({ value: c.hex, label: c.name, card: c })), ...NAMED_COLORS.map((c) => ({ value: c.label, label: c.label, card: undefined }))];
  for (const c of colors) {
    out.push({ group: '몸통 색', id: `bodyColor:${c.label}`, label: c.label, item: { kind: 'bodyColor', value: c.value, label: `몸통 색: ${c.label}`, ...(c.card ? { card: c.card } : {}) } });
    out.push({ group: '채널 색', id: `channelColor:${c.label}`, label: c.label, item: { kind: 'channelColor', value: c.value, label: `채널 색: ${c.label}`, ...(c.card ? { card: c.card } : {}) } });
  }
  const productName = productById(o.productId)?.name ?? '몸통';
  for (const g of optionGroupsFor(o)) for (const f of g.fields) if (f.kind === 'select' && !f.paint) for (const v of f.values ?? []) out.push({ group: `${productName} 옵션`, id: `option:${f.key}:${v.id}`, label: `${f.label}: ${v.label}`, item: { kind: 'option', key: f.key, value: v.id, label: `${f.label}: ${v.label}` } });
  for (const f of partOptionFields(newPart('channel', 'ch-front'))) if (f.kind === 'select' && !f.paint) for (const v of f.values ?? []) out.push({ group: '채널 옵션', id: `channelOption:${f.key}:${v.id}`, label: `${f.label}: ${v.label}`, item: { kind: 'channelOption', key: f.key, value: v.id, label: `채널 ${f.label}: ${v.label}` } });
  return out;
}

const KEY = 'ganpanda.specRules';
export function loadLocalRules(): SpecRule[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter(validRule) : []; } catch { return []; }
}
export function saveLocalRules(rules: SpecRule[]) { try { localStorage.setItem(KEY, JSON.stringify(rules)); } catch { /* 기기에 못 남겨도 동작 */ } }
