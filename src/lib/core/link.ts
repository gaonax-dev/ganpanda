// 여러 사진에 같은 사인물 (사용자 결정 2026-10-14): 연결된 영역은 규격을 원본(sameAs)에서 읽고
// 위치(사진·영역·모양·기준 체크)만 자기 것을 갖는다. 견적·리스트에는 원본만 나온다.
import type { SignObject } from './model';

/** 원본에서 읽는 규격 필드 */
export const SPEC_FIELDS = [
  'name', 'productId', 'sheetIds', 'widthMm', 'heightMm', 'depthMm', 'text', 'charCount', 'letter3d', 'design', 'designHistory', 'listX', 'listY', 'corner', 'options', 'note', 'parts',
] as const satisfies readonly (keyof SignObject)[];
export type SpecField = (typeof SPEC_FIELDS)[number];

export const isSpecField = (k: string): k is SpecField => (SPEC_FIELDS as readonly string[]).includes(k);

/** 규격만 뽑기 (없는 필드는 undefined 로 — 복사할 때 원본에 없는 값은 지워지도록) */
export function specOf(o: SignObject): Pick<SignObject, SpecField> {
  const out = {} as Record<string, unknown>;
  for (const k of SPEC_FIELDS) out[k] = o[k];
  return out as Pick<SignObject, SpecField>;
}

/** 연결을 풀어 보이는 그대로의 사인물 목록으로: 연결된 영역은 원본 규격 + 자기 위치. 원본이 없으면 독립 영역 */
export function resolveLinks(objs: SignObject[]): SignObject[] {
  const byId = new Map(objs.map((o) => [o.id, o]));
  return objs.map((o) => {
    const m = o.sameAs ? byId.get(o.sameAs) : undefined;
    if (!m || m.id === o.id) return o.sameAs ? { ...o, sameAs: undefined } : o;
    return { ...o, ...specOf(m), sameAs: m.id };
  });
}

/** 원본 id 에 연결된 영역들 */
export const copiesOf = (masterId: string, objs: SignObject[]) => objs.filter((o) => o.sameAs === masterId);
