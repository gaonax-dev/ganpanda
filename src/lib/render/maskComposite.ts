// 앞가림 마스크를 렌더링 PNG(제안 이미지 주간·야간)에 (2026-11-08 "마스크를 추가한다" → "앞가림 마스크"): 3D 로 그린 그림 위에 마스크 모양대로 원래 사진을 다시 덮는다.
// 보드에서는 PhotoMasks 층이 하고, 사진 한 장으로 나가는 그림은 여기서. 야간은 뷰어 배경과 같은 어둡기·푸른 기(viewer.setNight: 밝기 0.2 × 색 0.75·0.82·1.2)를 곱한다
import { pathD, type Path } from '../core/pathEdit';

/** 야간 사진 곱하기 색 (sim/viewer.ts setNight 의 배경 밝기 × 색) */
export const NIGHT_MULTIPLY = [0.2 * 0.75, 0.2 * 0.82, Math.min(1, 0.2 * 1.2)].map((v) => Math.round(v * 255)) as [number, number, number];

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('그림을 읽지 못했습니다')); im.src = src; });

/** rendered(사진 비율의 PNG/JPEG URL) 위에 마스크 부분만 photoUrl 사진을. photoW·photoH = 마스크 좌표(사진 px)의 기준 */
export async function withMasks(rendered: string, photoUrl: string, masks: Path[], photoW: number, photoH: number, night = false, type = 'image/png'): Promise<string> {
  if (!masks.length) return rendered;
  const [base, photo] = await Promise.all([loadImage(rendered), loadImage(photoUrl)]);
  const c = document.createElement('canvas');
  c.width = base.naturalWidth; c.height = base.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  const k = c.width / photoW;
  ctx.save();
  const clip = new Path2D();
  for (const m of masks) clip.addPath(new Path2D(pathD(m, k)));
  ctx.clip(clip);
  ctx.drawImage(photo, 0, 0, c.width, (photoH * k));
  if (night) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${NIGHT_MULTIPLY.join(',')})`;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.restore();
  const url = c.toDataURL(type);
  c.width = c.height = 0;
  return url;
}
