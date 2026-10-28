// 사진 LOD (2026-10-29 사용자: "줌인아웃을 반복하면 다운된다" → "사진도 lod 쓸수 있나?"): 화면에서 작게 보이는 사진·3D 그림은
// 긴 변 THUMB_MAX 의 작은 그림으로 — 줌아웃하면 모든 사진이 한꺼번에 화면에 들어와 표시 사본(휴대폰 긴 변 1600 ≈ 풀면 7.7MB)이 다 풀렸다.
// 작은 그림은 한 번에 하나씩 만들고(만드는 동안의 메모리도 한 장분) 주소를 기억한다.

/** 작은 그림의 긴 변 (px) — 사진이 화면에서 이보다 크게(기기 배율 포함) 보이면 원래 그림을 위에 */
export const THUMB_MAX = 480;
const CACHE_MAX = 200;

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

const loadImage = (url: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });

/** 화면에 그릴 크기(CSS px) × 기기 배율이 작은 그림보다 크면 원래 그림이 필요하다 */
export function needsFull(screenW: number, screenH: number, dpr: number, max = THUMB_MAX): boolean {
  return Math.max(screenW, screenH) * dpr > max;
}

/** src 를 긴 변 max 로 줄인 그림 주소 — 이미 작거나 실패하면 src 그대로 */
export function smallUrl(src: string, max = THUMB_MAX): Promise<string> {
  const k = `${src}|${max}`;
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
  const p = queue.then(async () => {
    const img = await loadImage(src);
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (long <= max) return src;
    const s = max / long;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const g = c.getContext('2d');
    if (!g) return src;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    c.width = c.height = 0;
    return b ? URL.createObjectURL(b) : src;
  }).catch(() => src);
  queue = p;
  cache.set(k, p);
  while (cache.size > CACHE_MAX) {
    const [old, op] = cache.entries().next().value!;
    cache.delete(old);
    const from = old.slice(0, old.lastIndexOf('|'));
    op.then((u) => { if (u !== from && u.startsWith('blob:')) URL.revokeObjectURL(u); });
  }
  return p;
}
