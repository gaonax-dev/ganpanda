// 완성품 퀵 (2026-10-23 사용자: "퀵에서는 간판을 선택하고 사진중에 하나를 선택하는데 현재 체널만 있다. 해당 상황은 완전제품이다.
// 그래서 완성된 상태에 따라 글자가 2가지 3가지가 될수 있어. 그냥 이전의 완성품 구성에 변경 가능한 필드를 하나씩 대입해서 완성하는 거이야. 중간에 멈추면 거기까지 완성이다.")
// 완성품 = 사진 + 사인물 구성 전체(몸통·옵션·구성 요소·글자) + 바꿀 칸(색 → 글자 내용). 칸은 하나씩 채우고, 채운 만큼 바로 저장된다.
// 사람의 결정 순서: 간판 → 종류(갈바·후렉스·채널간판·후광간판·후렉스채널) → 배경색·글자색 → 내용 / 스카시 → 아크릴 → 아크릴색(도색)·글자색 → 내용.
// 갈바·후렉스·스카시는 아직 사진이 없어 그림(public/sign-types/*.svg) — 사진이 오면 바꾼다 (2026-10-23 "갈바나 후렉스들도 같은 칸에 있어서 선택 가능하게")
import type { MaterialLayer, SignObject, SignPart } from './model';
import type { Group } from './catalog';
import { CHANNEL_PRESETS } from './channelLibrary';
import { applyPreset } from './partPresets';
import { commitParts, newItem, newPart, partsOf } from './parts';
import { paintHex } from './materials';
import type { PartPreset } from './components/types';

export interface TemplateSlot {
  id: string;
  label: string;
  kind: 'color' | 'text';
  /** 지금 값 (색은 #hex, 없으면 '') */
  read(o: SignObject): string;
  /** 이 칸만 바꾸는 패치 */
  write(o: SignObject, v: string): Partial<SignObject>;
}
/** 간판의 큰 갈래 (2026-10-27 사용자: "간판 종류 선택에 프레임간판, 체널간판 으로 먼저 분류를 하고 세부 사항으로 간다") */
export type SignFamily = 'frame' | 'channel';
export const SIGN_FAMILIES: { id: SignFamily; label: string; desc: string }[] = [
  { id: 'frame', label: '프레임간판', desc: '조명·비조명·돌출 판 간판 (위에 채널 글자도)' },
  { id: 'channel', label: '채널간판', desc: '벽에 바로 붙이는 입체 글자' },
];
/** 프레임간판의 세부 갈래 (2026-10-27 사용자가 보낸 한울상사 분류 "조명 프레임 간판 · 비조명 프레임 간판 · 돌출 프레임 간판" → "진행해줘") */
export type FrameSub = 'lit' | 'unlit' | 'protrude';
export const FRAME_SUBS: { id: FrameSub; label: string; desc: string }[] = [
  { id: 'lit', label: '조명 프레임간판', desc: '후렉스 면 · 안에 LED' },
  { id: 'unlit', label: '비조명 프레임간판', desc: '도장 갈바 판 · 조명 없음' },
  { id: 'protrude', label: '돌출 프레임간판', desc: '벽에서 튀어나온 양면 간판' },
];
export interface SignTemplate {
  id: string;
  group: Group;
  /** 간판의 큰 갈래 — 간판 분류만 */
  family?: SignFamily;
  /** 프레임간판의 세부 갈래 */
  sub?: FrameSub;
  label: string;
  desc: string;
  img: string;
  /** 완성품 구성 통째로 */
  apply(o: SignObject): Partial<SignObject>;
  /** 바꿀 칸 (지금 구성 기준 — 글자가 여러 개면 글자 1·2…) */
  slots(o: SignObject): TemplateSlot[];
}

type Opts = Record<string, string | boolean>;
/** 완성품의 구성 요소 하나 */
interface PartDef { kind: SignPart['kind']; type?: string; preset?: PartPreset; options?: Opts; stack?: (p: SignPart) => MaterialLayer[]; /** 글자 높이 = 간판 높이 × 이 비율 */ text?: number }
/** 색 칸: 몸통 옵션 도색(prefix) · 구성 요소 도색(prefix) · 구성 요소 미리보기 색(key) */
type ColorDef = { label: string } & ({ body: string } | { part: number; paint: string } | { part: number; key: string });
interface TemplateDef { id: string; group: Group; family?: SignFamily; sub?: FrameSub; label: string; desc: string; img: string; productId: string; options?: Opts; parts: PartDef[]; colors: ColorDef[] }

const paintPatch = (prefix: string, v: string): Opts => ({ [`${prefix}System`]: '직접', [`${prefix}Code`]: v });
/** n 번째 구성 요소 (완성품에 넣은 순서 — 같은 종류끼리 몇 번째인지로 찾는다) */
function partAt(o: SignObject, defs: PartDef[], n: number): SignPart | undefined {
  const kind = defs[n].kind;
  const nth = defs.slice(0, n).filter((d) => d.kind === kind).length;
  return partsOf(o).filter((p) => p.kind === kind)[nth];
}
function editPart(o: SignObject, partId: string, fn: (p: SignPart) => void): Partial<SignObject> {
  const ps: SignPart[] = JSON.parse(JSON.stringify(partsOf(o)));
  const p = ps.find((x) => x.id === partId);
  if (p) fn(p);
  return commitParts(o, ps);
}

function build(d: TemplateDef): SignTemplate {
  return {
    id: d.id, group: d.group, ...(d.family ? { family: d.family } : {}), ...(d.sub ? { sub: d.sub } : {}), label: d.label, desc: d.desc, img: d.img,
    apply(o) {
      const h = o.heightMm || 375;
      const parts = d.parts.map((pd) => {
        let p = newPart(pd.kind, pd.type ?? pd.preset?.type);
        if (pd.preset) p = applyPreset(p, pd.preset, o);
        if (pd.options) p = { ...p, options: { ...(p.options ?? {}), ...pd.options } };
        if (pd.stack) p = { ...p, stack: pd.stack(p) };
        if (pd.text) p = { ...p, items: [{ ...newItem('text'), text: '간판', h: Math.round(h * pd.text) }] };
        return p;
      });
      return { productId: d.productId, ...commitParts({ ...o, options: {}, parts: undefined, layers: undefined }, parts), options: { ...(d.options ?? {}) } };
    },
    slots(o) {
      const colors: TemplateSlot[] = d.colors.flatMap((c, k): TemplateSlot[] => {
        if ('body' in c) return [{ id: `c${k}`, label: c.label, kind: 'color', read: (x) => paintHex(x.options, c.body) ?? '', write: (x, v) => ({ options: { ...(x.options ?? {}), ...paintPatch(c.body, v) } }) }];
        const part = partAt(o, d.parts, c.part);
        if (!part) return [];
        const get = (x: SignObject) => partsOf(x).find((p) => p.id === part.id);
        if ('paint' in c) return [{ id: `c${k}`, label: c.label, kind: 'color', read: (x) => paintHex(get(x)?.options, c.paint) ?? '', write: (x, v) => editPart(x, part.id, (p) => { p.options = { ...(p.options ?? {}), ...paintPatch(c.paint, v) }; }) }];
        return [{ id: `c${k}`, label: c.label, kind: 'color', read: (x) => String(get(x)?.options?.[c.key] ?? ''), write: (x, v) => editPart(x, part.id, (p) => { p.options = { ...(p.options ?? {}), [c.key]: v }; }) }];
      });
      const texts = d.parts.flatMap((_, n) => { const p = partAt(o, d.parts, n); return p ? p.items.filter((i) => i.kind === 'text').map((it) => ({ p, it })) : []; });
      const words: TemplateSlot[] = texts.map(({ p, it }, j) => ({
        id: `${p.id}:${it.id}`, label: texts.length > 1 ? `글자 ${j + 1}` : '글자', kind: 'text',
        read: (x) => partsOf(x).find((q) => q.id === p.id)?.items.find((i) => i.id === it.id)?.text ?? '',
        write: (x, v) => editPart(x, p.id, (q) => { const i = q.items.find((y) => y.id === it.id); if (i) i.text = v; }),
      }));
      return [...colors, ...words];
    },
  };
}

/** 채널 묶음의 색 칸: 묶음에 있는 몸통·앞면·캡 도색 */
const channelColors = (pr: PartPreset, part: number): ColorDef[] =>
  ([['body', '몸통(옆면)색'], ['face', '글자(앞면)색'], ['cap', '캡색']] as const).filter(([k]) => pr.options[`${k}System`] !== undefined).map(([k, label]) => ({ label, part, paint: k }));
const FRONT = CHANNEL_PRESETS.find((p) => p.no === 12)!; // 전광 채널 (흰 앞면 · 컬러 옆면)

const DEFS: TemplateDef[] = [
  { id: 'galva', group: 'sign', family: 'frame', sub: 'unlit', label: '갈바 간판', desc: '도장 갈바 판 · 커팅 시트 글자', img: '/sign-types/galva.svg', productId: 'board-galva',
    options: paintPatch('paint', '#f4f4f2'), parts: [{ kind: 'sheet', type: 'sh-cut', options: { previewColor: '#141414' }, text: 0.6 }],
    colors: [{ label: '배경색', body: 'paint' }, { label: '글자색', part: 0, key: 'previewColor' }] },
  { id: 'flex', group: 'sign', family: 'frame', sub: 'lit', label: '후렉스 간판', desc: '후렉스 출력 · 내부 조명', img: '/sign-types/flex.svg', productId: 'board-flex',
    options: paintPatch('face', '#f4f4f2'), parts: [{ kind: 'sheet', type: 'sh-print', options: { included: true, previewColor: '#c0392b' }, text: 0.6 }],
    colors: [{ label: '배경색', body: 'face' }, { label: '글자색', part: 0, key: 'previewColor' }] },
  { id: 'flex-channel', group: 'sign', family: 'frame', sub: 'lit', label: '후렉스 + 채널', desc: '후렉스 바탕 위 전광 채널', img: '/sign-types/flex-channel.svg', productId: 'board-flex',
    options: paintPatch('face', '#1f2a44'), parts: [{ kind: 'channel', preset: FRONT, text: 0.6 }],
    colors: [{ label: '배경색', body: 'face' }, ...channelColors(FRONT, 0)] },
  { id: 'galva-channel', group: 'sign', family: 'frame', sub: 'unlit', label: '갈바 + 채널', desc: '도장 갈바 판 위 전광 채널', img: '/sign-types/galva-channel.svg', productId: 'board-galva',
    options: paintPatch('paint', '#3a3f44'), parts: [{ kind: 'channel', preset: FRONT, text: 0.6 }],
    colors: [{ label: '배경색', body: 'paint' }, ...channelColors(FRONT, 0)] },
  { id: 'protrude', group: 'sign', family: 'frame', sub: 'protrude', label: '돌출 간판', desc: '벽에서 튀어나온 양면 후렉스 조명 간판', img: '/sign-types/protrude.svg', productId: 'board-protrude',
    options: paintPatch('face', '#f4f4f2'), parts: [{ kind: 'sheet', type: 'sh-print', options: { included: true, previewColor: '#c0392b' }, text: 0.5 }],
    colors: [{ label: '배경색', body: 'face' }, { label: '글자색', part: 0, key: 'previewColor' }] },
  // 채널 15종 = 벽에 바로 (몸통 없음)
  ...CHANNEL_PRESETS.map((pr): TemplateDef => ({ id: `ch-${String(pr.no).padStart(2, '0')}`, group: 'sign', family: 'channel', label: pr.label, desc: pr.desc, img: pr.img, productId: 'body-none', parts: [{ kind: 'channel', preset: pr, text: 0.8 }], colors: channelColors(pr, 0) })),
  // 아크릴 스카시: 아크릴색 = 옆면 도색, 글자색 = 앞면 도색
  { id: 'sc-acrylic', group: 'scashi', label: '아크릴 스카시', desc: '아크릴 입체 글자 · 옆면 도색 · 앞면 색', img: '/sign-types/scashi-acrylic.svg', productId: 'ch-scashi',
    parts: [{ kind: 'scashi', type: 'ch-scashi', options: { ...paintPatch('acSide', '#f4f4f2'), ...paintPatch('paint', '#141414') }, stack: (p) => (p.stack ?? []).map((l, i) => (i === 0 ? { ...l, side: { kind: 'paint', ref: 'acSide' } } : l)), text: 0.8 }],
    colors: [{ label: '아크릴색', part: 0, paint: 'acSide' }, { label: '글자색', part: 0, paint: 'paint' }] },
];

export const SIGN_TEMPLATES: SignTemplate[] = DEFS.map(build);
export const templatesFor = (g: Group | null, family?: SignFamily | null, sub?: FrameSub | null): SignTemplate[] =>
  SIGN_TEMPLATES.filter((t) => t.group === g && (!family || t.family === family) && (!sub || t.sub === sub));
/** 갈래 안의 세부 갈래 (프레임간판 = 조명·비조명·돌출, 그 밖은 없음) — 대표 그림은 첫 완성품 */
export const subsFor = (g: Group | null, family: SignFamily | null): { id: FrameSub; label: string; desc: string; img: string }[] =>
  family === 'frame' ? FRAME_SUBS.map((f) => ({ ...f, img: templatesFor(g, family, f.id)[0]?.img ?? '' })).filter((f) => f.img) : [];
/** 이 분류에서 먼저 고를 갈래 (간판 = 프레임간판·채널간판, 그 밖은 없음) — 각 갈래의 대표 그림은 첫 완성품 */
export const familiesFor = (g: Group | null): { id: SignFamily; label: string; desc: string; img: string }[] =>
  SIGN_FAMILIES.map((f) => ({ ...f, img: templatesFor(g, f.id)[0]?.img ?? '' })).filter((f) => f.img);
