// 사양 글 → 빠른 설정 항목 (2026-10-17 사용자: "사이즈 작성하고 다음줄에 텍스트로 사용자가 입력하면 퀵설정과 같은 요소가 생성되게",
// "글은 해당 내용을 대화상자에서 체킹하고 적용하면 없어지게", "후랙스 연한베이지 비조명 체널 버건디 전광 두께 120 … 이렇게 넣어도 자동으로 구성되게").
// 사전 매칭이라 결과가 항상 같다(AI 없음). 글은 저장하지 않는다 — 확인 창에서 체크한 항목만 적용.
// 알아보는 것: 종류(별칭·철자 변형) · 색(기본색 어휘 + 연한/진한) · 채널 종류 · LED(색온도) · 사이즈 · 두께 · 그리고 **그 종류의 옵션 값**(비조명·양면·카바…)과 채널 옵션 값(캡·오싸이·용접…)
import type { SignObject } from './model';
import { CHANNEL_OPTIONS, categoryOf, groupOfProduct, productById } from './catalog';
import { NAMED_COLORS, shadeHex } from './materials';
import { optionGroupsFor, partOptionFields, type OptionField } from './options';
import { categoryPatch, newPart, partsOf } from './parts';
import { applyQuick, ledLabel, type QuickPatch } from './quickSpec';

export type SpecItem =
  | { kind: 'product'; id: string; label: string }
  | { kind: 'bodyColor'; value: string; label: string }
  | { kind: 'channel'; id: string; label: string }
  | { kind: 'channelColor'; value: string; label: string }
  | { kind: 'led'; value: string; label: string }
  | { kind: 'size'; w: number; h: number; label: string }
  | { kind: 'thick'; mm: number; label: string }
  | { kind: 'option'; key: string; value: string; label: string }
  | { kind: 'channelOption'; key: string; value: string; label: string }
  | { kind: 'note'; text: string; label: string };

/** 종류 별칭 (글에 들어 있으면) → 제품 id. 긴 것부터 맞춘다. 철자 변형(후랙스·플랙스·포멕스)도 */
const PRODUCT_ALIASES: [string, string][] = [
  ['알루미늄복합판', 'board-acp'], ['복합판', 'board-acp'], ['라이트패널', 'board-lightpanel'], ['패브릭', 'board-fabric'], ['사인미러', 'board-mirror'],
  ['천갈이', 'board-reface'], ['에어간판', 'board-air'], ['전광판', 'board-ledsign'], ['지주', 'board-pole'], ['돌출', 'board-protrude'],
  ['파이프', 'board-pipe'], ['트러스', 'board-truss'], ['후렉스', 'board-flex'], ['후랙스', 'board-flex'], ['플렉스', 'board-flex'], ['플랙스', 'board-flex'], ['갈바', 'board-galva'],
  ['포맥스', 'board-foamex'], ['포멕스', 'board-foamex'], ['아크릴', 'board-acrylic'], ['어닝', 'board-awning'], ['현수막', 'banner'],
];
/** 색 별칭 → 기본색 이름 (NAMED_COLORS 이름 자체도 그대로 알아본다) */
const COLOR_ALIASES: Record<string, string> = {
  백색: '흰색', 화이트: '흰색', 블랙: '검정', 검정색: '검정', 검은색: '검정', 그레이: '회색', 브라운: '갈색', 빨간색: '빨강', 레드: '빨강', 파란색: '파랑', 블루: '파랑',
  노란색: '노랑', 옐로: '노랑', 녹색: '초록', 그린: '초록', 골드: '금색', 실버: '은색', 오렌지: '주황', 핑크: '분홍', 퍼플: '보라', 자주: '보라', 네이비색: '네이비',
  하늘색: '하늘', 스카이블루: '하늘', 와인색: '와인', 버건디색: '버건디', 코퍼: '구리', 아이보리색: '아이보리', 베이지색: '베이지', 크림색: '크림', 밝은회색: '연회색', 연한회색: '연회색',
};
const LIGHT_WORDS = ['연한', '밝은', '라이트', '연'];
const DARK_WORDS = ['진한', '어두운', '다크', '진'];
const CHANNEL_ALIASES: [string, string][] = [['전후광', 'ch-both'], ['후광', 'ch-halo'], ['전광', 'ch-front'], ['에폭시', 'ch-galva'], ['통아크릴', 'ch-acrylic'], ['벌브', 'ch-bulb']];
const LED_WORDS: Record<string, string> = { 주백색: '주백색', 전구색: '전구색' };
/** 색온도 → LED 색 (값은 기존 이름 그대로) */
const kelvinToLed = (k: number) => (k <= 3500 ? '전구색' : k <= 4800 ? '주백색' : '백색');
/** 옵션 값 맞추기에서 빼는 키: 다른 규칙이 맡는 것 (채널·스카시 선택, LED, 상단 조명 색) */
const SKIP_KEYS = new Set(['channel', 'scashi', 'ledColor', 'topColor']);

/** 토큰 → 색: 이름·별칭 그대로면 {name}, 연한/진한 + 색이면 밝게/어둡게 한 hex */
function colorOf(tok: string): { value: string; label: string } | null {
  const names = [...NAMED_COLORS.map((c) => c.label), ...Object.keys(COLOR_ALIASES)].sort((a, b) => b.length - a.length);
  const norm = (n: string) => COLOR_ALIASES[n] ?? n;
  const exact = names.find((n) => tok === n);
  if (exact) return { value: norm(exact), label: norm(exact) };
  for (const [words, dir, k] of [[LIGHT_WORDS, 'light', 0.45], [DARK_WORDS, 'dark', 0.35]] as const) {
    for (const w of words) {
      if (!tok.startsWith(w) || tok.length <= w.length) continue;
      const rest = tok.slice(w.length);
      const base = names.find((n) => rest === n);
      if (!base) continue;
      const name = norm(base);
      const hex = NAMED_COLORS.find((c) => c.label === name)!.hex;
      return { value: shadeHex(hex, dir, k), label: `${w === '연' ? '연한' : w === '진' ? '진한' : w} ${name}` };
    }
  }
  const inside = names.find((n) => tok.includes(n));
  return inside ? { value: norm(inside), label: norm(inside) } : null;
}

/** 옵션 값 사전: 그 종류의 select 값(몸통) + 채널 구성 요소의 select 값 */
function optionDict(o: SignObject | undefined, productId: string | undefined): { body: { f: OptionField; value: string }[]; channel: { f: OptionField; value: string }[] } {
  if (!o) return { body: [], channel: [] };
  const base = productId && productId !== o.productId ? { ...o, productId, options: undefined, parts: undefined } : o;
  const pick = (fs: OptionField[]) => fs.filter((f) => f.kind === 'select' && !SKIP_KEYS.has(f.key) && !f.paint).flatMap((f) => (f.values ?? []).map((v) => ({ f, value: v.id })));
  return { body: pick(optionGroupsFor(base).flatMap((g) => g.fields)), channel: pick(partOptionFields(newPart('channel', 'ch-front'))) };
}
const norm = (s: string) => s.replace(/[\s()·/]/g, '').toLowerCase();

export function parseSpecText(text: string, o?: SignObject): SpecItem[] {
  const items: SpecItem[] = [];
  const leftovers: string[] = [];
  let src = text.replace(/,/g, (_m, off: number) => (/\d/.test(text[off - 1] ?? '') && /\d/.test(text[off + 1] ?? '') ? '' : ' '));
  // 사이즈 "3000x600" / "3,000 × 600" 는 공백이 있을 수 있어 먼저 뽑는다
  src = src.replace(/(\d{2,5})\s*[x×X*]\s*(\d{2,5})/g, (_m, w: string, h: string) => { items.push({ kind: 'size', w: Number(w), h: Number(h), label: `사이즈: ${Number(w).toLocaleString('ko-KR')}×${Number(h).toLocaleString('ko-KR')}mm` }); return ' '; });
  const tokens = src.split(/\s+/).filter(Boolean);
  // 종류를 먼저 알아야 그 종류의 옵션 값을 맞출 수 있다
  const productId = tokens.map((t) => PRODUCT_ALIASES.find(([a]) => t.includes(a))?.[1]).find(Boolean) ?? o?.productId;
  const dict = optionDict(o, productId);
  let colors = 0, sawChannel = false, channelIdx = -1, genericIdx = -1, awaitThick = false;
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    // "두께 120" / "두께 120mm" / "두께120" (글의 순서를 지키려고 토큰 자리에서 처리)
    const thickHere = low.match(/^두께(\d+(?:\.\d+)?)(?:mm|t)?$/);
    if (thickHere) { items.push({ kind: 'thick', mm: Number(thickHere[1]), label: `두께: ${thickHere[1]}` }); continue; }
    if (tok === '두께') { awaitThick = true; continue; }
    if (awaitThick) { awaitThick = false; const n = low.match(/^(\d+(?:\.\d+)?)(?:mm|t)?$/); if (n) { items.push({ kind: 'thick', mm: Number(n[1]), label: `두께: ${n[1]}` }); continue; } }
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
    if (tok.includes('채널') || tok.includes('체널')) { if (!sawChannel) { items.push({ kind: 'channel', id: 'ch-front', label: '채널: 전광 채널' }); sawChannel = true; channelIdx = genericIdx = items.length - 1; } continue; }
    const prod = PRODUCT_ALIASES.find(([a]) => tok.includes(a));
    if (prod) { items.push({ kind: 'product', id: prod[1], label: `몸통: ${productById(prod[1])?.name ?? prod[1]}` }); continue; }
    const color = colorOf(tok);
    if (color) {
      // 채널 뒤의 색은 채널 색, 아니면 첫 색은 몸통·둘째 색은 채널
      const forChannel = (sawChannel && items.length - 1 === channelIdx) || colors === 1;
      items.push(forChannel ? { kind: 'channelColor', value: color.value, label: `채널 색: ${color.label}` } : { kind: 'bodyColor', value: color.value, label: `몸통 색: ${color.label}` });
      colors++;
      continue;
    }
    // 옵션 값: 채널을 말한 뒤면 채널 옵션 먼저, 아니면 몸통 옵션 먼저. 토큰과 값이 (공백·괄호 빼고) 같거나, 값이 토큰으로 시작하는 유일한 것
    const nt = norm(tok);
    const find = (list: { f: OptionField; value: string }[]) => list.find((d) => norm(d.value) === nt) ?? (nt.length >= 2 && list.filter((d) => norm(d.value).startsWith(nt)).length === 1 ? list.find((d) => norm(d.value).startsWith(nt)) : undefined);
    const first = sawChannel ? dict.channel : dict.body, second = sawChannel ? dict.body : dict.channel;
    const hit1 = find(first), hit2 = hit1 ? undefined : find(second);
    const hit = hit1 ?? hit2;
    if (hit) {
      const isChannel = (hit1 ? first : second) === dict.channel;
      items.push(isChannel ? { kind: 'channelOption', key: hit.f.key, value: hit.value, label: `채널 ${hit.f.label}: ${hit.value}` } : { kind: 'option', key: hit.f.key, value: hit.value, label: `${hit.f.label}: ${hit.value}` });
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
  const chOpts: Record<string, string> = {};
  for (const i of items) {
    if (i.kind === 'bodyColor') q.bodyColor = i.value;
    else if (i.kind === 'channel') q.channelType = i.id;
    else if (i.kind === 'channelColor') q.channelColor = i.value;
    else if (i.kind === 'led') q.led = i.value;
    else if (i.kind === 'channelOption') chOpts[i.key] = i.value;
  }
  const needsChannel = q.channelType === undefined && (q.channelColor !== undefined || q.led !== undefined || Object.keys(chOpts).length > 0) && !base.parts?.some((p) => p.kind === 'channel') && !base.options?.channel;
  if (needsChannel) q.channelType = 'ch-front';
  if (Object.keys(q).length) patch = { ...patch, ...applyQuick({ ...base, ...(q.productId ? { productId: q.productId } : {}) }, q) };
  // 몸통 옵션 값 (종류를 바꾼 뒤의 옵션 위에)
  const bodyOpts = items.filter((i): i is Extract<SpecItem, { kind: 'option' }> => i.kind === 'option');
  if (bodyOpts.length) patch.options = { ...(patch.options ?? base.options ?? {}), ...Object.fromEntries(bodyOpts.map((i) => [i.key, i.value])) };
  // 채널 옵션 값 → 첫 채널 구성 요소
  if (Object.keys(chOpts).length) {
    const parts = JSON.parse(JSON.stringify(patch.parts ?? partsOf({ ...base, ...patch } as SignObject))) as NonNullable<SignObject['parts']>;
    const ch = parts.find((p) => p.kind === 'channel');
    if (ch) { ch.options = { ...(ch.options ?? {}), ...chOpts }; patch.parts = parts; }
  }
  for (const i of items) {
    if (i.kind === 'size') { patch.widthMm = i.w; patch.heightMm = i.h; }
    else if (i.kind === 'thick') patch.depthMm = i.mm;
    else if (i.kind === 'note') patch.note = o.note?.trim() ? `${o.note.trim()}\n${i.text}` : i.text;
  }
  return patch;
}
