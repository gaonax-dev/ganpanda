// 벽면 보정 결과와 모서리 붙이기. 보정 자체는 사진별 카메라 설정(camera.ts)에서 만든다.
import type { Pt } from './homography';

export interface Calibration {
  /** 사진 px → 벽면 좌표 (축척 전) */
  H: number[];
  sx: number; sy: number;
  /** (옛 기준선 방식의 흔적) 기준별 편차 — 카메라 설정에서는 비어 있다 */
  perRef: { objectId: string; edge: 'top' | 'bottom' | 'left' | 'right'; kind: 'h' | 'v'; deviation: number }[];
  warnings: string[];
}

const applyH = (H: number[], [x, y]: Pt): Pt => {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
};
const len = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 사각 영역의 실제 크기: 위·아래 변 평균 × 가로 축척, 좌·우 변 평균 × 세로 축척 */
export function measureQuad(c: Calibration, quad: Pt[]): { widthMm: number; heightMm: number } {
  const [tl, tr, br, bl] = quad.map((p) => applyH(c.H, p));
  return { widthMm: ((len(tl, tr) + len(bl, br)) / 2) * c.sx, heightMm: ((len(tl, bl) + len(tr, br)) / 2) * c.sy };
}

// ---------- 모서리 붙이기 (AI) ----------
export interface Gray { data: Uint8Array | Uint8ClampedArray; width: number; height: number }

/**
 * 선을 법선 방향으로 ±range px 옮겨 보며 밝기 변화가 가장 큰 위치(사진 속 실제 모서리)에 붙인다.
 * confidence = (최대 변화 − 평균 변화) / 최대 변화 (0~1). 모서리가 없으면 낮다
 */
export function snapEdge(img: Gray, line: { a: Pt; b: Pt }, range = 8): { a: Pt; b: Pt; offset: number; confidence: number } {
  const dx = line.b[0] - line.a[0], dy = line.b[1] - line.a[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L; // 법선
  const samples = Math.max(8, Math.min(64, Math.round(L / 4)));
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return 0;
    return img.data[yi * img.width + xi];
  };
  // 법선 방향 밝기 변화(그라디언트)를 선 전체에서 평균
  const grad = (d: number) => {
    let s = 0;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 0.8 + 0.1; // 끝점 근처는 제외
      const x = line.a[0] + dx * t + nx * d, y = line.a[1] + dy * t + ny * d;
      s += Math.abs(at(x + nx, y + ny) - at(x - nx, y - ny));
    }
    return s / (samples + 1);
  };
  let best = 0, bestG = -1, sum = 0, n = 0;
  for (let d = -range; d <= range; d++) {
    const g = grad(d);
    sum += g; n++;
    if (g > bestG) { bestG = g; best = d; }
  }
  const mean = sum / n;
  const confidence = bestG > 0 ? Math.max(0, (bestG - mean) / bestG) : 0;
  if (confidence < 0.2) return { a: line.a, b: line.b, offset: 0, confidence };
  return { a: [line.a[0] + nx * best, line.a[1] + ny * best], b: [line.b[0] + nx * best, line.b[1] + ny * best], offset: best, confidence };
}
