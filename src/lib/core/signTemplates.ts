// 완성품 퀵 (2026-10-23 사용자: "퀵에서는 간판을 선택하고 사진중에 하나를 선택하는데 현재 체널만 있다. 해당 상황은 완전제품이다.
// 그래서 완성된 상태에 따라 글자가 2가지 3가지가 될수 있어. 그냥 이전의 완성품 구성에 변경 가능한 필드를 하나씩 대입해서 완성하는 거이야. 중간에 멈추면 거기까지 완성이다.")
// 완성품 = 사진 + 사인물 구성 전체(몸통·옵션·구성 요소·글자) + 바꿀 칸(색 → 글자 내용). 칸은 하나씩 채우고, 채운 만큼 바로 저장된다.
// 사람의 결정 순서: 간판 → 종류(사진) → 배경색·글자색 → 내용 / 스카시 → 아크릴 → 아크릴색·글자색 → 내용. 지금 사진은 채널 15종뿐 — 갈바·후렉스·후렉스+채널·스카시 완성품은 사진이 오면 더한다.
import type { SignObject, SignPart } from './model';
import type { Group } from './catalog';
import { CHANNEL_PRESETS } from './channelLibrary';
import { applyPreset } from './partPresets';
import { commitParts, newItem, newPart, partsOf } from './parts';
import { paintHex } from './materials';
import { componentOf } from './components';

export interface TemplateSlot {
  id: string;
  label: string;
  kind: 'color' | 'text';
  /** 지금 값 (색은 #hex, 없으면 '') */
  read(o: SignObject): string;
  /** 이 칸만 바꾸는 패치 */
  write(o: SignObject, v: string): Partial<SignObject>;
}
export interface SignTemplate {
  id: string;
  group: Group;
  label: string;
  desc: string;
  img: string;
  /** 완성품 구성 통째로 */
  apply(o: SignObject): Partial<SignObject>;
  /** 바꿀 칸 (지금 구성 기준 — 글자가 여러 개면 글자 1·2…) */
  slots(o: SignObject): TemplateSlot[];
}

/** 구성 요소 하나를 고쳐 저장하는 패치 */
function editPart(o: SignObject, partId: string, fn: (p: SignPart) => void): Partial<SignObject> {
  const ps: SignPart[] = JSON.parse(JSON.stringify(partsOf(o)));
  const p = ps.find((x) => x.id === partId);
  if (p) fn(p);
  return commitParts(o, ps);
}
const COLOR_SLOTS: { prefix: string; label: string }[] = [
  { prefix: 'body', label: '몸통(옆면)색' }, { prefix: 'face', label: '글자(앞면)색' }, { prefix: 'cap', label: '캡색' },
];

function channelTemplate(pr: (typeof CHANNEL_PRESETS)[number]): SignTemplate {
  const id = `ch-${String(pr.no).padStart(2, '0')}`;
  /** 이 묶음을 가진 구성 요소 (종류 이름 대신 레지스트리 presets 로) */
  const partOf = (o: SignObject) => partsOf(o).find((p) => componentOf(p.kind).presets?.includes(pr));
  return {
    id, group: 'sign', label: pr.label, desc: pr.desc, img: pr.img,
    apply(o) {
      const it = { ...newItem('text'), text: '간판', h: Math.round((o.heightMm || 375) * 0.8) };
      const part = { ...applyPreset(newPart('channel'), pr, o), items: [it] };
      return { productId: 'body-none', ...commitParts({ ...o, options: {}, parts: undefined, layers: undefined }, [part]) };
    },
    slots(o) {
      const part = partOf(o);
      if (!part) return [];
      const colors: TemplateSlot[] = COLOR_SLOTS.filter((c) => pr.options[`${c.prefix}System`] !== undefined).map((c) => ({
        id: `${part.id}:${c.prefix}`, label: c.label, kind: 'color',
        read: (x) => { const p = partOf(x); return (p && paintHex(p.options, c.prefix)) ?? ''; },
        write: (x, v) => editPart(x, part.id, (p) => { p.options = { ...(p.options ?? {}), [`${c.prefix}System`]: '직접', [`${c.prefix}Code`]: v }; }),
      }));
      const texts = part.items.filter((i) => i.kind === 'text');
      const words: TemplateSlot[] = texts.map((it, j) => ({
        id: `${part.id}:${it.id}`, label: texts.length > 1 ? `글자 ${j + 1}` : '글자', kind: 'text',
        read: (x) => partOf(x)?.items.find((i) => i.id === it.id)?.text ?? '',
        write: (x, v) => editPart(x, part.id, (p) => { const i = p.items.find((y) => y.id === it.id); if (i) i.text = v; }),
      }));
      return [...colors, ...words];
    },
  };
}

export const SIGN_TEMPLATES: SignTemplate[] = CHANNEL_PRESETS.map(channelTemplate);
export const templatesFor = (g: Group | null): SignTemplate[] => SIGN_TEMPLATES.filter((t) => t.group === g);
