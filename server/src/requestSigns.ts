// 요청에 실린 사인물 JSON 검사 (2026-10-21 소비자 견적 요청) — 앱의 core/requestSigns.ts 와 같은 규칙 (서버는 앱 코드를 안 가져온다)
export interface RequestSign { photo: number | null; name: string; shape: 'rect' | 'polygon'; quad: [number, number][]; corner?: number; widthMm?: number; heightMm?: number; productId?: string; memo?: string }
export const MAX_REQUEST_SIGNS = 50;
export const MAX_SIGNS_JSON = 64 * 1024;

const isPt = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

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
    const r: RequestSign = { photo, name: o.name.trim().slice(0, 60) || '사인물', shape, quad: o.quad as [number, number][] };
    if (typeof o.corner === 'number' && o.corner >= 0 && o.corner <= 0.5) r.corner = o.corner;
    const w = num(o.widthMm), h = num(o.heightMm);
    if (w) r.widthMm = w;
    if (h) r.heightMm = h;
    if (typeof o.productId === 'string' && o.productId) r.productId = o.productId.slice(0, 40);
    if (typeof o.memo === 'string' && o.memo.trim()) r.memo = o.memo.trim().slice(0, 500);
    out.push(r);
  }
  if (JSON.stringify(out).length > MAX_SIGNS_JSON) return null;
  return out;
}
