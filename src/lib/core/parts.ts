// 조합형 사인물 (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트 / 간판프레임 아래에 선택가능한 리스트를 넣어주면 해당 객체를 사용한다 /
// 채널 객체에 포함된 글자 입력객체를 간판 중앙에 배치하고 크기와 위치지정 가능하게 / 스카시 객체… 글자 입력객체 사용 그림입력객체도 있음 /
// 체널도 추가 할수 있는 시트를 올려 커팅시트, uv출력 시트… 글자와 객체 여러개", 답 "뭐든 붙일 수 있다", "그림: 디자인 파일·직접 올린 그림 둘다").
// 사인물 = 간판 프레임(productId·options) + 구성 요소(parts: 채널·스카시·시트) + 내용 객체(items: 글자·그림, 간판 중앙 기준 mm).
// 저장된 parts 가 없으면 옛 필드(채널·스카시 옵션, 문구, 시트)에서 읽을 때 만든다 — 예전 프로젝트는 그대로 동작한다.
import type { PartItem, SignObject, SignPart } from './model';
import { CHANNEL_OPTIONS, SCASHI_OPTIONS, isChannelProduct, productById, sheetById, takesLetters } from './catalog';

export const PART_KIND_LABEL: Record<SignPart['kind'], string> = { channel: '채널', scashi: '스카시', sheet: '시트' };
/** 구성 요소 종류마다 고를 수 있는 세부 종류 (채널 제품 · 스카시 제품 · 시트) */
export const PART_TYPES: Record<SignPart['kind'], { id: string; label: string }[]> = {
  channel: CHANNEL_OPTIONS,
  scashi: SCASHI_OPTIONS,
  sheet: [{ id: 'sh-cut', label: '커팅 시트 (단색·재질)' }, { id: 'sh-print', label: 'UV 출력 시트 (돔보)' }, { id: 'sh-frost', label: '안개 시트' }],
};

const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
export function newPart(kind: SignPart['kind'], type = PART_TYPES[kind][0].id): SignPart {
  return { id: uid(), kind, type, ...(kind === 'sheet' ? { on: 'frame' } : {}), items: [] };
}
/** 새 내용 객체: 간판 중앙, 글자 높이·그림 높이 300mm */
export function newItem(kind: PartItem['kind']): PartItem {
  return { id: uid(), kind, ...(kind === 'text' ? { text: '' } : {}), x: 0, y: 0, h: 300 };
}

/** 구성 요소 이름 (채널: 채널 옵션 이름, 스카시: 제품 이름, 시트: 시트 이름) */
export const partLabel = (p: SignPart) =>
  p.kind === 'channel' ? CHANNEL_OPTIONS.find((c) => c.id === p.type)?.label ?? productById(p.type)?.name ?? p.type
  : p.kind === 'scashi' ? productById(p.type)?.name ?? p.type
  : sheetById(p.type)?.name ?? p.type;

const CH_KEYS = ['chType', 'chBuild', 'chDepth', 'chDouble', 'ledColor', 'font', 'bodySystem', 'bodyCode', 'chFrame', 'chFrameColor', 'bracket'];
const SC_KEYS: Record<string, string> = { scThick: 'thickness', scMaterial: 'material', scPaintSystem: 'paintSystem', scPaintCode: 'paintCode' };
const pick = (opts: Record<string, string | boolean>, keys: string[]) => Object.fromEntries(keys.filter((k) => opts[k] !== undefined).map((k) => [k, opts[k]]));

/** 이 사인물의 구성 요소. 저장된 것이 있으면 그것, 없으면 옛 필드에서. 간판 분류가 아니면 없음 */
export function partsOf(o: SignObject): SignPart[] {
  if (o.parts) return o.parts;
  const legacyChannel = isChannelProduct(o.productId);
  if (!legacyChannel && !takesLetters(o.productId)) return [];
  const opts = o.options ?? {};
  const out: SignPart[] = [];
  const text = (o.text ?? '').trim();
  const textItem = (h: number | undefined, id: string): PartItem[] => (text || o.charCount ? [{ id, kind: 'text', text: o.text ?? '', ...(o.charCount ? { count: o.charCount } : {}), x: 0, y: 0, h: h ?? 0 }] : []);
  const ch = legacyChannel ? o.productId! : CHANNEL_OPTIONS.find((c) => c.label === opts.channel)?.id;
  if (ch) out.push({ id: 'legacy-channel', kind: 'channel', type: ch, options: pick(opts, CH_KEYS), items: textItem(Number(opts.chHeight) || o.heightMm, 'legacy-channel-text') });
  const sc = SCASHI_OPTIONS.find((c) => c.label === opts.scashi)?.id;
  if (sc && !legacyChannel) out.push({ id: 'legacy-scashi', kind: 'scashi', type: sc, options: Object.fromEntries(Object.entries(SC_KEYS).filter(([k]) => opts[k] !== undefined).map(([k, v]) => [v, opts[k]])), items: textItem(Number(opts.scHeight) || o.heightMm, 'legacy-scashi-text') });
  for (const id of o.sheetIds) out.push({ id: `legacy-sheet-${id}`, kind: 'sheet', type: id, on: 'frame', options: pick(opts, ['transferTape', 'coating', 'base', 'ink', 'sheetMat', 'halfCut']), items: [] });
  return out;
}

/** 요약 문구: 구성 요소마다 이름 + 글자("…" 높이) + 그림 수 */
export function describeParts(o: SignObject): string[] {
  return partsOf(o).map((p) => {
    const texts = p.items.filter((i) => i.kind === 'text' && (i.text ?? '').trim()).map((i) => `"${(i.text ?? '').trim()}" ${Math.round(i.h)}mm`);
    const imgs = p.items.filter((i) => i.kind === 'image').length;
    return [partLabel(p), ...texts, ...(imgs ? [`그림 ${imgs}`] : [])].join(' ');
  });
}
