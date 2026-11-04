// 편집 층(SVG) 잘라 그리기 (2026-11-04 사용자: "맥 앱에서 줌인을 많이 들어가면 컨트롤로와 글자 해상도가 깨진다"):
// 사인물 외곽선·손잡이·정보 글자는 사진 전체 크기의 SVG 한 층에 그린다. 보드를 크게 확대하면 이 층이 실제 화면 픽셀로 수만 px 이 되고,
// WebKit(맥·아이폰 앱, GPU 합성)은 층 그림 크기 상한을 넘으면 해상도를 낮춰 그린 뒤 늘려 보여 준다(크롬은 조각으로 나눠 그려 괜찮다).
// → 층이 상한을 넘을 만큼 커지면 **화면에 보이는 부분 + 여유**만 SVG 로 그린다(viewBox 를 그 부분으로). 좌표(사진 px)는 그대로라 동작은 같다.

/** 층 한 변의 상한 (실제 화면 픽셀). 넘으면 자른다 */
export const SVG_MAX_PX = 4096;

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * photo = 사진의 보드 자리(world), px = 사진 원본 크기, viewport = 보드 화면 변환(screen = world × zoom + (x, y)), screen = 보드 화면 크기(CSS px), dpr = 기기 배율.
 * 자를 필요 없으면 null, 아니면 그릴 부분(사진 px). 보이는 부분을 화면 반 장 단위로 맞추고 앞뒤로 반 장씩 더해 — 조금 끄는 동안은 같은 값(층을 매번 다시 만들지 않게)
 */
export function svgClip(photo: { x: number; y: number; width: number; height: number }, px: { w: number; h: number }, viewport: { x: number; y: number; zoom: number }, screen: { w: number; h: number }, dpr: number): Rect | null {
  const z = viewport.zoom;
  if (Math.max(photo.width, photo.height) * z * dpr <= SVG_MAX_PX) return null;
  const qx = screen.w / z / 2, qy = screen.h / z / 2;
  const vx0 = -viewport.x / z, vy0 = -viewport.y / z, vx1 = vx0 + screen.w / z, vy1 = vy0 + screen.h / z;
  const wx0 = Math.floor(vx0 / qx) * qx - qx, wx1 = Math.ceil(vx1 / qx) * qx + qx;
  const wy0 = Math.floor(vy0 / qy) * qy - qy, wy1 = Math.ceil(vy1 / qy) * qy + qy;
  const sx = px.w / photo.width, sy = px.h / photo.height;
  const x0 = Math.min(px.w, Math.max(0, (wx0 - photo.x) * sx)), x1 = Math.min(px.w, Math.max(0, (wx1 - photo.x) * sx));
  const y0 = Math.min(px.h, Math.max(0, (wy0 - photo.y) * sy)), y1 = Math.min(px.h, Math.max(0, (wy1 - photo.y) * sy));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
