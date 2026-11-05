// 일러스트 → 간판다 구성 요소 묶음 (.ganpanda) (2026-11-05 사용자: "내가 디자이너야 사인물에 각각의 디자인이 연결되어야해 후렉스(인쇄) 위에 체널(입체),
// 스카시(입체+ 시트 또는 도색)의 구성이라면 일러스트 레이어를 생성하고 이걸 내보내서 자동으로 간판다에서 보여질 수 있게").
// 일러스트 스크립트의 [간판다로 보내기]가 사인물 레이어 안 구성 요소 레이어마다 대지 크기로 내보낸 것: 입체 = SVG(글자 윤곽선), 인쇄 = PNG.
// part = 'frame'(바탕 인쇄 → 사인물 바탕 디자인) 또는 구성 요소 id. → docs/features/illustrator.md

export const BUNDLE_FORMAT = 'ganpanda-illustrator-bundle';
export const BUNDLE_EXT = '.ganpanda';
export const FRAME_PART = 'frame';

export interface BundleItem { sign: string; part: string; kind: 'svg' | 'png'; /** base64 */ data: string }
export interface Bundle { format: typeof BUNDLE_FORMAT; version: number; items: BundleItem[] }

export const isBundleName = (name: string) => name.toLowerCase().endsWith(BUNDLE_EXT);

/** 묶음 JSON 읽기 — 형식이 아니면 null, 잘못된 항목은 뺀다 */
export function parseBundle(text: string): Bundle | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  const b = j as Partial<Bundle>;
  if (!b || b.format !== BUNDLE_FORMAT || !Array.isArray(b.items)) return null;
  const items = b.items.filter((x): x is BundleItem => !!x && typeof x.sign === 'string' && typeof x.part === 'string' && (x.kind === 'svg' || x.kind === 'png') && typeof x.data === 'string');
  return { format: BUNDLE_FORMAT, version: Number(b.version) || 1, items };
}

/** PNG 크기 (IHDR) — 아니면 null */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** 적용할 항목: 있는 사인물의 바탕(frame) 또는 있는 구성 요소만 */
export function bundleTargets(items: BundleItem[], signs: { id: string; parts: string[] }[]): BundleItem[] {
  return items.filter((it) => { const s = signs.find((x) => x.id === it.sign); return !!s && (it.part === FRAME_PART || s.parts.includes(it.part)); });
}

/** SVG 크기 (viewBox, 없으면 width·height) — 바탕 디자인 페이지 크기 */
export function svgSize(text: string): { w: number; h: number } | null {
  const vb = /viewBox\s*=\s*"([^"]+)"/.exec(text);
  if (vb) { const n = vb[1].trim().split(/[\s,]+/).map(Number); if (n.length === 4 && n[2] > 0 && n[3] > 0) return { w: n[2], h: n[3] }; }
  const w = /<svg[^>]*\swidth\s*=\s*"([\d.]+)/.exec(text), h = /<svg[^>]*\sheight\s*=\s*"([\d.]+)/.exec(text);
  return w && h ? { w: Number(w[1]), h: Number(h[1]) } : null;
}
