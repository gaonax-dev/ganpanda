// 사양 글 → 빠른 설정 항목 (2026-10-17 사용자: "사이즈 작성하고 다음줄에 텍스트로 사용자가 입력하면 퀵설정과 같은 요소가 생성되게",
// "글은 해당 내용을 대화상자에서 체킹하고 적용하면 없어지게"). 사전 매칭이라 결과가 항상 같다(AI 없음). 글은 저장하지 않는다 — 확인 창에서 체크한 항목만 적용.
import type { SignObject } from './model';
import { CHANNEL_OPTIONS, categoryOf, groupOfProduct, productById } from './catalog';
import { categoryPatch } from './parts';
import { applyQuick, ledLabel, type QuickPatch } from './quickSpec';

export type SpecItem =
  | { kind: 'product'; id: string; label: string }
  | { kind: 'bodyColor'; value: string; label: string }
  | { kind: 'channel'; id: string; label: string }
  | { kind: 'channelColor'; value: string; label: string }
  | { kind: 'led'; value: string; label: string }
  | { kind: 'size'; w: number; h: number; label: string }
  | { kind: 'thick'; mm: number; label: string }
  | { kind: 'note'; text: string; label: string };

/** 종류 별칭 (글에 들어 있으면) → 제품 id. 긴 것부터 맞춘다 */
const PRODUCT_ALIASES: [string, string][] = [
  ['알루미늄복합판', 'board-acp'], ['복합판', 'board-acp'], ['라이트패널', 'board-lightpanel'], ['패브릭', 'board-fabric'], ['사인미러', 'board-mirror'],
  ['천갈이', 'board-reface'], ['에어간판', 'board-air'], ['전광판', 'board-ledsign'], ['지주', 'board-pole'], ['돌출', 'board-protrude'],
  ['파이프', 'board-pipe'], ['트러스', 'board-truss'], ['후렉스', 'board-flex'], ['플렉스', 'board-flex'], ['갈바', 'board-galva'],
  ['포맥스', 'board-foamex'], ['포멕스', 'board-foamex'], ['아크릴', 'board-acrylic'], ['어닝', 'board-awning'], ['현수막', 'banner'],
];
const COLOR_ALIASES: Record<string, string> = { 백색: '흰색', 화이트: '흰색', 블랙: '검정', 검정색: '검정', 검은색: '검정', 회색: '회색', 그레이: '회색', 갈색: '갈색', 브라운: '갈색', 빨강: '빨강', 빨간색: '빨강', 레드: '빨강', 파랑: '파랑', 파란색: '파랑', 블루: '파랑', 노랑: '노랑', 노란색: '노랑', 옐로: '노랑', 초록: '초록', 녹색: '초록', 그린: '초록', 금색: '금색', 골드: '금색', 은색: '은색', 실버: '은색', 진회색: '진회색', 흰색: '흰색' };
const CHANNEL_ALIASES: [string, string][] = [['전후광', 'ch-both'], ['후광', 'ch-halo'], ['전광', 'ch-front'], ['에폭시', 'ch-galva'], ['통아크릴', 'ch-acrylic'], ['벌브', 'ch-bulb']];
const LED_WORDS: Record<string, string> = { 주백색: '주백색', 전구색: '전구색' };
/** 색온도 → LED 색 (값은 기존 이름 그대로) */
const kelvinToLed = (k: number) => (k <= 3500 ? '전구색' : k <= 4800 ? '주백색' : '백색');

const colorOf = (tok: string): string | null => {
  const keys = Object.keys(COLOR_ALIASES).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => tok.includes(k));
  return hit ? COLOR_ALIASES[hit] : null;
};

export function parseSpecText(text: string): SpecItem[] {
  const items: SpecItem[] = [];
  const leftovers: string[] = [];
  // 사이즈 "3000x600" / "3,000 × 600" 는 공백이 있을 수 있어 먼저 뽑는다
  let src = text.replace(/,/g, (_m, off: number) => (/\d/.test(text[off - 1] ?? '') && /\d/.test(text[off + 1] ?? '') ? '' : ' '));
  src = src.replace(/(\d{2,5})\s*[x×X*]\s*(\d{2,5})/g, (_m, w: string, h: string) => { items.push({ kind: 'size', w: Number(w), h: Number(h), label: `사이즈: ${Number(w).toLocaleString('ko-KR')}×${Number(h).toLocaleString('ko-KR')}mm` }); return ' '; });
  let colors = 0, sawChannel = false, channelIdx = -1, genericIdx = -1;
  for (const tok of src.split(/\s+/).filter(Boolean)) {
    const low = tok.toLowerCase();
    const kelvin = low.match(/^(\d{4})k$/);
    if (kelvin) { const v = kelvinToLed(Number(kelvin[1])); items.push({ kind: 'led', value: v, label: `LED: ${ledLabel(v)}` }); continue; }
    const thick = low.match(/^(\d+(?:\.\d+)?)t$/);
    if (thick) { items.push({ kind: 'thick', mm: Number(thick[1]), label: `두께: ${thick[1]}T` }); continue; }
    const led = Object.keys(LED_WORDS).find((k) => tok.includes(k));
    if (led) { items.push({ kind: 'led', value: LED_WORDS[led], label: `LED: ${ledLabel(LED_WORDS[led])}` }); continue; }
    const ch = CHANNEL_ALIASES.find(([a]) => tok.includes(a));
    if (ch) {
      const item: SpecItem = { kind: 'channel', id: ch[1], label: `채널: ${CHANNEL_OPTIONS.find((c) => c.id === ch[1])!.label}` };
      // "채널 … 후광" — 앞에 '채널'로만 잡힌 전광이 있으면 그 종류로 바꾼다
      if (genericIdx >= 0) { items[genericIdx] = item; genericIdx = -1; } else { items.push(item); channelIdx = items.length - 1; }
      sawChannel = true; continue;
    }
    if (tok.includes('채널')) { if (!sawChannel) { items.push({ kind: 'channel', id: 'ch-front', label: '채널: 전광 채널' }); sawChannel = true; channelIdx = genericIdx = items.length - 1; } continue; }
    const prod = PRODUCT_ALIASES.find(([a]) => tok.includes(a));
    if (prod) { items.push({ kind: 'product', id: prod[1], label: `몸통: ${productById(prod[1])?.name ?? prod[1]}` }); continue; }
    const color = colorOf(tok);
    if (color) {
      // 채널 뒤의 색은 채널 색, 아니면 첫 색은 몸통·둘째 색은 채널
      const forChannel = (sawChannel && items.length - 1 === channelIdx) || colors === 1;
      items.push(forChannel ? { kind: 'channelColor', value: color, label: `채널 색: ${color}` } : { kind: 'bodyColor', value: color, label: `몸통 색: ${color}` });
      colors++;
      continue;
    }
    leftovers.push(tok);
  }
  if (leftovers.length) items.push({ kind: 'note', text: leftovers.join(' '), label: `요청사항에 추가: ${leftovers.join(' ')}` });
  return items;
}

/** 확인 창에서 체크한 항목을 사인물 패치로. 종류가 다른 분류면 분류부터 바꾼다(옵션 초기화) */
export function applySpecItems(o: SignObject, items: SpecItem[]): Partial<SignObject> {
  let base: SignObject = o;
  let patch: Partial<SignObject> = {};
  const product = items.find((i): i is Extract<SpecItem, { kind: 'product' }> => i.kind === 'product');
  if (product && product.id !== o.productId) {
    const g = groupOfProduct(product.id);
    if (g !== categoryOf(o)) { const cp = categoryPatch(o, g, product.id); patch = { ...patch, ...cp }; base = { ...o, ...cp } as SignObject; }
  }
  const q: QuickPatch = {};
  if (product) q.productId = product.id;
  for (const i of items) {
    if (i.kind === 'bodyColor') q.bodyColor = i.value;
    else if (i.kind === 'channel') q.channelType = i.id;
    else if (i.kind === 'channelColor') q.channelColor = i.value;
    else if (i.kind === 'led') q.led = i.value;
  }
  if (Object.keys(q).length) {
    // 채널 색·LED 만 있고 채널이 없으면 전광 채널로 만든다
    if (q.channelType === undefined && (q.channelColor !== undefined || q.led !== undefined) && !base.parts?.some((p) => p.kind === 'channel') && !base.options?.channel) q.channelType = 'ch-front';
    patch = { ...patch, ...applyQuick({ ...base, ...(q.productId ? { productId: q.productId } : {}) }, q) };
  }
  for (const i of items) {
    if (i.kind === 'size') { patch.widthMm = i.w; patch.heightMm = i.h; }
    else if (i.kind === 'thick') patch.depthMm = i.mm;
    else if (i.kind === 'note') patch.note = o.note?.trim() ? `${o.note.trim()}\n${i.text}` : i.text;
  }
  return patch;
}
