// 앞면 객체(글자·그림·도형) 하나를 캔버스에 — 3D 텍스처와 2D 구운 그림이 함께 쓴다 (three 없이, 2026-10-29 sim/signs.ts 에서 옮김)
export interface FaceDrawItem { kind: string; text?: string; color: string; shape?: string; fill?: string; stroke?: string; opacity?: number }
/** 앞면 객체 하나를 캔버스에 (텍스처·올라선 판 공용): 그림 / 글자(상자 폭 96% 에 맞춤) / 도형(사각·원·선, 채움·선 색) */
export function drawFaceItem(ctx: CanvasRenderingContext2D, it: FaceDrawItem, left: number, top: number, w: number, h: number, img: CanvasImageSource | undefined, fontFamily: string, weight = 800) {
  if (it.kind === 'image') { if (img) ctx.drawImage(img, left, top, w, h); return; }
  if (it.kind === 'shape') {
    const fill = it.fill ?? null, stroke = it.stroke ?? (it.fill ? null : it.color);
    ctx.save();
    if (it.opacity !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, it.opacity)); // 안개 시트 반투명
    ctx.lineWidth = Math.max(1, Math.max(w, h) * 0.02);
    if (it.shape === 'line') { ctx.strokeStyle = it.stroke ?? it.fill ?? it.color; ctx.lineWidth = Math.max(1, h * 0.5); ctx.beginPath(); ctx.moveTo(left, top + h / 2); ctx.lineTo(left + w, top + h / 2); ctx.stroke(); ctx.restore(); return; }
    ctx.beginPath();
    if (it.shape === 'ellipse') ctx.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else ctx.rect(left, top, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    ctx.restore();
    return;
  }
  if (!it.text) return;
  const size = h * 0.9;
  ctx.save();
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  const mw = ctx.measureText(it.text).width;
  ctx.translate(left + w / 2, top + h / 2);
  if (mw > 0) ctx.scale((w * 0.96) / mw, 1); // 2D 와 같이 상자 폭 96% 에 늘이고 줄임 (2026-10-18)
  ctx.fillStyle = it.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(it.text, 0, 0);
  ctx.restore();
}
