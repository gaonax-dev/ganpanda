// 사인물 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다").
// 복사 = 규격(종류·치수·문구·옵션·메모·디자인)과 모양(외곽선·둥글기). 위치 연결(sameAs)·평면도 자리·디자인 이력·대화는 담지 않는다.
import type { Pt } from './homography';
import type { SignObject } from './model';
import { specOf } from './link';

type Omitted = 'id' | 'createdAt' | 'photoId' | 'sameAs' | 'listX' | 'listY' | 'designHistory';
export interface ClipSign {
  fields: Omit<SignObject, Omitted>;
  /** 복사한 사진 (크기가 다른 사진에 붙일 때 비율, 같은 사진이면 정면 축·박스 방향 유지) */
  photo: { id: string; w: number; h: number };
}

/** 선택한 사인물 → 클립보드. 연결된 사인물이면 원본(master)의 규격으로 */
export function clipOf(o: SignObject, master: SignObject | undefined, photo: { id: string; w: number; h: number }): ClipSign {
  const { id: _i, createdAt: _c, photoId: _p, sameAs: _s, listX: _x, listY: _y, designHistory: _h, ...rest } = master && o.sameAs ? { ...o, ...stripUndefined(specOf(master)) } : o;
  return { fields: copyJson(rest), photo: { ...photo } };
}
/** 깊은 복사 (사인물은 JSON 값뿐. structuredClone 은 화면 상태(프록시)에 쓰면 실패한다) */
const copyJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const stripUndefined = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * 붙여넣을 새 사인물: 대상 사진 크기에 비율대로, n 번째 붙이기만큼 비켜서(사진 폭의 3%씩), 사진 밖으로 나가지 않게.
 * 이름은 "… 복사". 다른 사진이면 그 사진의 원근에 맞춘 정면 축·박스 방향·돌려 세우기는 뺀다. 디자인 소스가 없으면 디자인도 뺀다
 */
export function pastedObject(clip: ClipSign, target: { id: string; w: number; h: number }, n: number, hasSource: (id: string) => boolean): Omit<SignObject, 'id' | 'createdAt'> {
  const sx = target.w / clip.photo.w, sy = target.h / clip.photo.h, step = Math.round(target.w * 0.03) * n;
  const map = (p: Pt): Pt => [Math.round(p[0] * sx) + step, Math.round(p[1] * sy) + step];
  let quad = clip.fields.quad.map(map), polygon = clip.fields.polygon?.map(map);
  if (quad.length) {
    // 사진 밖이면 안으로
    const dx = Math.min(0, target.w - Math.max(...quad.map((p) => p[0]))) - Math.min(0, Math.min(...quad.map((p) => p[0])));
    const dy = Math.min(0, target.h - Math.max(...quad.map((p) => p[1]))) - Math.min(0, Math.min(...quad.map((p) => p[1])));
    const shift = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
    quad = quad.map(shift); polygon = polygon?.map(shift);
  }
  const f = copyJson(clip.fields);
  const same = target.id === clip.photo.id;
  return {
    ...f,
    photoId: clip.fields.quad.length ? target.id : '',
    name: `${f.name} 복사`,
    quad, ...(polygon ? { polygon } : {}),
    faceAxis: same ? f.faceAxis : undefined,
    boxDir: same ? f.boxDir : undefined,
    turn: same ? f.turn : undefined,
    design: f.design && hasSource(f.design.sourceId) ? f.design : undefined,
  };
}
