// 견적 요청에 싣는 사인물 (2026-10-21 사용자: "소비자는 간판견적을 보고 견적 요청하는 방식 … 사업자 버전의 도형그리기 사이즈 그리고 메모로 견적을 요청하게")
// 소비자가 /estimate(로컬 보드)에서 그린 사인물을 요청판 요청에 JSON 으로 싣고, 간판사가 [제안 만들기]로 연 프로젝트에 그대로 그려 넣는다.
// 사진은 요청 사진 번호(올린 순서 n)로 가리킨다. 서버는 같은 규칙으로 검사한다(server/src/requestSigns.ts — 서버는 앱 코드를 안 가져온다)
import type { Photo, SignObject } from './model';
import type { Pt } from './homography';

export interface RequestSign {
  /** 요청 사진 번호 (올린 순서). 사진 없는 카드 사인물은 null */
  photo: number | null;
  name: string;
  shape: 'rect' | 'polygon';
  /** 사진 px 외곽 TL,TR,BR,BL (사진 없으면 []) */
  quad: Pt[];
  corner?: number;
  widthMm?: number;
  heightMm?: number;
  productId?: string;
  memo?: string;
}

export const MAX_REQUEST_SIGNS = 50;

/** 보드의 사진·사인물 → 요청에 실을 형태. photoOrder = 사진을 올릴 순서(= 번호) */
export function serializeRequestSigns(photos: Photo[], signs: SignObject[]): { photoOrder: Photo[]; signs: RequestSign[] } {
  const photoOrder = [...photos].sort((a, b) => a.x - b.x || a.y - b.y); // 보드에서 왼쪽부터
  const index = new Map(photoOrder.map((p, i) => [p.id, i]));
  const out: RequestSign[] = [];
  for (const o of signs) {
    if (o.sameAs) continue; // 연결 영역은 원본 하나로
    const photo = o.photoId ? index.get(o.photoId) : undefined;
    if (o.photoId && photo === undefined) continue; // 사진이 없어진 사인물
    const s: RequestSign = { photo: photo ?? null, name: o.name, shape: o.shape === 'polygon' ? 'polygon' : 'rect', quad: photo === undefined ? [] : o.quad.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt) };
    if (o.corner) s.corner = o.corner;
    if (o.widthMm) s.widthMm = o.widthMm;
    if (o.heightMm) s.heightMm = o.heightMm;
    if (o.productId) s.productId = o.productId;
    if (o.note?.trim()) s.memo = o.note.trim().slice(0, 500); // 사인물 메모(note) → 요청의 memo
    out.push(s);
  }
  return { photoOrder, signs: out.slice(0, MAX_REQUEST_SIGNS) };
}

const isPt = (p: unknown): p is Pt => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

/** 요청에 실린 JSON 검사 (앱·서버 공통 규칙). 틀리면 null */
export function validateRequestSigns(x: unknown): RequestSign[] | null {
  if (!Array.isArray(x) || x.length > MAX_REQUEST_SIGNS) return null;
  const out: RequestSign[] = [];
  for (const s of x) {
    if (!s || typeof s !== 'object') return null;
    const o = s as Record<string, unknown>;
    const photo = o.photo === null || o.photo === undefined ? null : typeof o.photo === 'number' && Number.isInteger(o.photo) && o.photo >= 0 ? o.photo : NaN;
    if (Number.isNaN(photo)) return null;
    if (typeof o.name !== 'string') return null;
    const shape = o.shape === 'polygon' ? 'polygon' : o.shape === 'rect' ? 'rect' : null;
    if (!shape) return null;
    if (!Array.isArray(o.quad) || !(o.quad.length === 0 || o.quad.length === 4) || !o.quad.every(isPt)) return null;
    if (photo !== null && o.quad.length !== 4) return null;
    const r: RequestSign = { photo, name: o.name.trim().slice(0, 60) || '사인물', shape, quad: o.quad as Pt[] };
    if (typeof o.corner === 'number' && o.corner >= 0 && o.corner <= 0.5) r.corner = o.corner;
    const w = num(o.widthMm), h = num(o.heightMm);
    if (w) r.widthMm = w;
    if (h) r.heightMm = h;
    if (typeof o.productId === 'string' && o.productId) r.productId = o.productId.slice(0, 40);
    if (typeof o.memo === 'string' && o.memo.trim()) r.memo = o.memo.trim().slice(0, 500);
    out.push(r);
  }
  return out;
}

/** 간판사 프로젝트에 그려 넣을 사인물: 요청 사진 번호 → 가져온 사진 id */
export function materializeRequestSigns(signs: RequestSign[], photoIds: string[]): Omit<SignObject, 'id' | 'createdAt'>[] {
  const out: Omit<SignObject, 'id' | 'createdAt'>[] = [];
  for (const s of signs) {
    const photoId = s.photo === null ? '' : photoIds[s.photo];
    if (s.photo !== null && !photoId) continue; // 그 사진이 안 들어왔으면 건너뛴다
    out.push({
      photoId, name: s.name, shape: s.shape, quad: photoId ? s.quad : [], sheetIds: [],
      ...(s.corner ? { corner: s.corner } : {}), ...(s.widthMm ? { widthMm: s.widthMm } : {}), ...(s.heightMm ? { heightMm: s.heightMm } : {}),
      ...(s.productId ? { productId: s.productId } : {}), ...(s.memo ? { note: s.memo } : {}),
    });
  }
  return out;
}
