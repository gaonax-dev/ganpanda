// 테스트용 합성 건물 사진 (실사진 없이 바로 체험할 수 있게)
import { applyHomography, solveHomography, type Pt } from '../core/homography';

export const SAMPLE = {
  wallW: 9000,
  wallH: 6000,
  corners: [[180, 140], [1380, 260], [1360, 980], [200, 1060]] as Pt[],
};

export function makeSamplePhoto(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1100;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#8fb7de'); sky.addColorStop(1, '#dfe9f2');
  g.fillStyle = sky; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#7d7f82'; g.fillRect(0, 980, c.width, 120);

  const { wallW: W, wallH: H, corners } = SAMPLE;
  const Hm = solveHomography([[0, H], [W, H], [W, 0], [0, 0]], corners);
  const poly = (pts: Pt[], fill: string) => {
    g.beginPath();
    pts.map((p) => applyHomography(Hm, p)).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, fill: string) =>
    poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill);

  rect(0, 0, W, H, '#d9cfc0');
  for (let y = 300; y < H; y += 300) rect(0, y - 8, W, y + 8, '#cfc4b3'); // 외장재 줄눈
  rect(0, 0, W, 3500, '#5d6a72'); // 1층 쇼윈도 프레임
  rect(150, 100, 3800, 3300, '#2e3d47');
  rect(5200, 100, 8850, 3300, '#2e3d47');
  rect(4000, 0, 5000, 2900, '#3b2f28'); // 출입문
  rect(0, 3700, W, 4700, '#ece7df'); // 간판 자리(파사드 띠)
  for (let x = 600; x < W - 600; x += 2100) rect(x, 4950, x + 1500, 5800, '#4c6577'); // 2층 창
  return c;
}
