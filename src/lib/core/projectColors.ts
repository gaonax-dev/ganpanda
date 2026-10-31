// 프로젝트 컬러 (2026-10-31 사용자: "색상을 개별구성에서 선택하지 않고 전체 사인물이 공유해야함으로 색상이 없을때 색상 선택기에는 프로젝트 컬러 메인컬러, 배경컬러,
// 포인트컬러 , ... 를 먼저 설정 … 시트, 필름, 원단, 페인트등의 요소를 선택하고 브랜드 코드 표시 … 엠버라는 컬러를 컬러피커(미리보기용)로 선택하고 시트는 lx c3940
// 페인트는 pantone … 이것을 각 사이물에 적용 그리고 해당 컬러를 변경하면 전부 변경 · 프로젝트 컬러셋을 추가하면 복제는 기존의 컬러 구성과 연결을 받아서").
// 프로젝트 설정 `colors`. 사인물 면은 칸(slot)을 가리키고(`<면>System = '프로젝트'`, `<면>Slot`), 3D·칩용으로 지금 색을 함께 적어 둔다(`<면>Hex`, `<면>Code` = 칸 이름, `<면>Ref` = 제작 코드)
// — 칸 색을 바꾸거나 셋을 바꾸면 refreshColorPatches 로 모두 다시 적는다
import { PROJECT_SYSTEM } from './materials';

export const COLOR_USES = [
  { id: 'sheet', label: '시트', hint: 'LX C3940' },
  { id: 'film', label: '필름', hint: '3M 1080-G12' },
  { id: 'fabric', label: '원단', hint: '' },
  { id: 'paint', label: '페인트', hint: 'PANTONE 7408 C' },
] as const;
export type ColorUse = (typeof COLOR_USES)[number]['id'];
export interface ColorSlot {
  id: string;
  /** 칸 이름 (메인·배경·포인트 …) */
  name: string;
  /** 색 이름 (앰버 …) */
  label?: string;
  /** 미리보기 색 */
  hex?: string;
  /** 제작에 쓰는 재료별 브랜드 코드 */
  uses?: Partial<Record<ColorUse, string>>;
}
export interface ColorSet { id: string; name: string; slots: ColorSlot[] }
export interface ProjectColors { sets: ColorSet[]; active: string }

const uid = () => Math.random().toString(36).slice(2, 10);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function newProjectColors(): ProjectColors {
  const set: ColorSet = { id: uid(), name: '기본', slots: ['메인', '배경', '포인트'].map((name) => ({ id: uid(), name })) };
  return { sets: [set], active: set.id };
}
export const activeSet = (pc: ProjectColors) => pc.sets.find((s) => s.id === pc.active) ?? pc.sets[0];
export const activeSlot = (pc: ProjectColors, slotId: string) => activeSet(pc)?.slots.find((s) => s.id === slotId) ?? null;

/** 칸 고치기 (셋 하나) */
export function setSlot(pc: ProjectColors, setId: string, slotId: string, patch: Partial<Omit<ColorSlot, 'id'>>): ProjectColors {
  const out = clone(pc);
  const s = out.sets.find((x) => x.id === setId)?.slots.find((x) => x.id === slotId);
  if (s) Object.assign(s, clone(patch));
  return out;
}
/** 칸 더하기 — 모든 셋에 같은 칸(연결)이 생긴다 */
export function addSlot(pc: ProjectColors, name: string): ProjectColors {
  const out = clone(pc);
  const id = uid();
  for (const s of out.sets) s.slots.push({ id, name });
  return out;
}
/** 셋 복제 (칸 id 그대로 = 사인물 연결 그대로) 하고 그 셋으로 */
export function duplicateSet(pc: ProjectColors, setId: string, name: string): ProjectColors {
  const out = clone(pc);
  const src = out.sets.find((s) => s.id === setId) ?? activeSet(out);
  const copy: ColorSet = { id: uid(), name, slots: clone(src.slots) };
  out.sets.push(copy);
  out.active = copy.id;
  return out;
}
export const switchSet = (pc: ProjectColors, setId: string): ProjectColors => ({ ...clone(pc), active: setId });

/** 면(prefix)에 칸을 연결하는 옵션 값. use = 그 면의 재료(시트·페인트 …) — 그 코드를 Ref 로 */
export function colorPatch(prefix: string, pc: ProjectColors, slotId: string, use?: ColorUse): Record<string, string> {
  const s = activeSlot(pc, slotId);
  const code = use ? s?.uses?.[use] : Object.values(s?.uses ?? {}).find(Boolean);
  return {
    [`${prefix}System`]: PROJECT_SYSTEM, [`${prefix}Slot`]: slotId,
    [`${prefix}Code`]: s ? `${s.name}${s.label ? ` · ${s.label}` : ''}` : '', [`${prefix}Hex`]: s?.hex ?? '',
    [`${prefix}Ref`]: code ?? '', ...(use ? { [`${prefix}Use`]: use } : {}),
  };
}
/** 면에 연결된 칸 id (없으면 null) */
export const slotOfOptions = (opts: Record<string, unknown> | undefined, prefix: string): string | null =>
  opts?.[`${prefix}System`] === PROJECT_SYSTEM && typeof opts[`${prefix}Slot`] === 'string' ? (opts[`${prefix}Slot`] as string) : null;

/** 옵션 안의 프로젝트 칸 연결을 지금 색으로 다시 적는다 — 바뀐 게 없으면 null */
function refreshOptions(opts: Record<string, unknown> | undefined, pc: ProjectColors): Record<string, unknown> | null {
  if (!opts) return null;
  let changed = false;
  const out = { ...opts };
  for (const k of Object.keys(opts)) {
    if (!k.endsWith('System') || opts[k] !== PROJECT_SYSTEM) continue;
    const prefix = k.slice(0, -'System'.length);
    const slot = opts[`${prefix}Slot`];
    if (typeof slot !== 'string') continue;
    const p = colorPatch(prefix, pc, slot, (opts[`${prefix}Use`] as ColorUse | undefined) ?? undefined);
    for (const [pk, pv] of Object.entries(p)) if (out[pk] !== pv) { out[pk] = pv; changed = true; }
  }
  return changed ? out : null;
}
interface ColoredObject { id: string; options?: Record<string, unknown>; parts?: { options?: Record<string, unknown> }[] }
/** 칸 색·셋을 바꾼 뒤 다시 적을 사인물들 */
export function refreshColorPatches(objects: ColoredObject[], pc: ProjectColors): { id: string; patch: { options?: Record<string, unknown>; parts?: ColoredObject['parts'] } }[] {
  const out: { id: string; patch: { options?: Record<string, unknown>; parts?: ColoredObject['parts'] } }[] = [];
  for (const o of objects) {
    const opt = refreshOptions(o.options, pc);
    let partsChanged = false;
    const parts = o.parts?.map((p) => { const r = refreshOptions(p.options, pc); if (r) partsChanged = true; return r ? { ...p, options: r } : p; });
    if (opt || partsChanged) out.push({ id: o.id, patch: { ...(opt ? { options: opt } : {}), ...(partsChanged ? { parts } : {}) } });
  }
  return out;
}
