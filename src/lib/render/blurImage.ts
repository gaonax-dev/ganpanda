// 안개 시트의 흐린 그림을 미리 만든다 (2026-10-29 사용자: "아이폰앱에서 2d에서 줌인 줌아웃을 하면 에러가 발생한다. 3d에서도 …" → 핀볼에서 확인)
// 전엔 사진(또는 3D 그림) 전체 크기 <img> 에 CSS blur(30px) 를 걸었다 — 필터는 층을 확대 배율만큼 큰 그림으로 다시 그려(12배·화면 배율 3)
// 아이폰 웹뷰 메모리가 넘쳤다. 이제 작은 그림으로 줄였다 키운 흐린 그림(바뀌지 않음, 주소별로 한 번)을 늘려 보여 준다 — 확대해도 메모리 그대로
const cache = new Map<string, Promise<string | undefined>>();
const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
/** 흐림 반경(표시 px) 대비 작게 그릴 비율 — 표시 폭 / (반경 × 0.8) 픽셀로 줄였다 늘리면 블러 30px 와 비슷하다 */
export const BLUR_SMALL_PER_RADIUS = 0.8;
export const BLUR_MAX_W = 400;

/** src 를 표시 폭 displayW 에서 radius(px) 만큼 흐린 그림의 주소 */
export function blurredUrl(src: string, displayW: number, radius = 30): Promise<string | undefined> {
  const smallW = Math.max(8, Math.min(BLUR_MAX_W, Math.round(displayW / (radius * BLUR_SMALL_PER_RADIUS))));
  const key = `${src}|${smallW}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const img = await load(src);
      const k = smallW / img.naturalWidth;
      const w = smallW, h = Math.max(4, Math.round(img.naturalHeight * k));
      // 두 번 줄여 계단 없이 부드럽게: 반 → 끝 크기
      const mid = document.createElement('canvas');
      mid.width = w * 2; mid.height = h * 2;
      const m = mid.getContext('2d')!; m.imageSmoothingQuality = 'high'; m.drawImage(img, 0, 0, mid.width, mid.height);
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const c = out.getContext('2d')!; c.imageSmoothingQuality = 'high'; c.drawImage(mid, 0, 0, w, h);
      mid.width = mid.height = 0;
      const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/jpeg', 0.9));
      return blob ? URL.createObjectURL(blob) : undefined;
    })().catch(() => undefined);
    cache.set(key, p);
  }
  return p;
}
