import { describe, expect, it } from 'vitest';
import { calibrate, measureQuad, refsFromObjects, snapEdge, type RefLine } from '../../src/lib/core/calibration';
import { projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';
import type { SignObject } from '../../src/lib/core/model';

// 합성 카메라 (homography.test 와 같은 모델): 10m×6m 벽을 비스듬히 촬영
const imgW = 4000, imgH = 3000, f = 3000;
function pose(yaw: number, pitch: number, C: number[]): CameraPose {
  const base = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
  const R = mul(Rx, mul(Ry, base));
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
}
/** 벽 위 직사각형 (좌하단 x,y / 크기 w,h mm) → 사진 사각 영역 TL,TR,BR,BL */
const rectOn = (p: CameraPose, x: number, y: number, w: number, h: number): Pt[] =>
  ([[x, y + h], [x + w, y + h], [x + w, y], [x, y]] as Pt[]).map(([a, b]) => projectPoint(p, [a, b, 0]));
const obj = (id: string, quad: Pt[], o: Partial<SignObject> = {}): SignObject =>
  ({ id, photoId: 'p', name: id, shape: 'rect', quad, sheetIds: [], createdAt: 0, ...o });

describe('기준선으로 원근·축척 보정', () => {
  const P = pose(0.45, -0.1, [3000, 2000, 8000]);
  const sign = obj('sign', rectOn(P, 1000, 2500, 4000, 900), { widthMm: 4000, heightMm: 900, refH: true });
  const door = obj('door', rectOn(P, 5500, 0, 1200, 2100), { widthMm: 1200, heightMm: 2100, refV: true });
  const band = rectOn(P, 0, 3600, 6000, 600); // 정답 6000×600

  it('사인물의 변 → 기준선 (가로 기준은 위·아래 변, 세로 기준은 좌·우 변)', () => {
    const refs = refsFromObjects([sign, door]);
    expect(refs.filter((r) => r.kind === 'h')).toHaveLength(2);
    expect(refs.filter((r) => r.kind === 'v')).toHaveLength(2);
    expect(refs.find((r) => r.kind === 'h')!.mm).toBe(4000);
    expect(refs.find((r) => r.kind === 'v')!.mm).toBe(2100);
  });

  it('가로 기준 + 세로 기준으로 다른 영역의 실제 크기를 1% 안에서 잰다', () => {
    const c = calibrate(refsFromObjects([sign, door]))!;
    expect(c).not.toBeNull();
    const m = measureQuad(c, band);
    expect(Math.abs(m.widthMm - 6000) / 6000).toBeLessThan(0.01);
    expect(Math.abs(m.heightMm - 600) / 600).toBeLessThan(0.01);
    expect(c.warnings).toEqual([]);
  });

  it('정면 사진(선들이 평행)에서도 동작한다', () => {
    const F = pose(0, 0, [5000, 3000, 12000]);
    const s = obj('s', rectOn(F, 1000, 2500, 4000, 900), { widthMm: 4000, heightMm: 900, refH: true, refV: true });
    const c = calibrate(refsFromObjects([s]))!;
    const m = measureQuad(c, rectOn(F, 0, 3600, 6000, 600));
    expect(Math.abs(m.widthMm - 6000) / 6000).toBeLessThan(0.01);
    expect(Math.abs(m.heightMm - 600) / 600).toBeLessThan(0.01);
  });

  it('기준끼리 모순(한 사인물의 가로가 틀림)이면 그 기준에 경고', () => {
    const wrong = obj('win', rectOn(P, 7000, 4000, 1500, 850), { widthMm: 2000, heightMm: 850, refH: true }); // 실제 1500
    const c = calibrate(refsFromObjects([sign, door, wrong]))!;
    const bad = c.perRef.filter((r) => Math.abs(r.deviation) > 0.1).map((r) => r.objectId);
    expect(bad).toContain('win');
    expect(c.warnings.some((w) => w.includes('win'))).toBe(true);
  });

  it('세로 기준이 없으면 가로 축척을 쓰고 안내 (세로 소실점을 가정하므로 근사: 3% 안)', () => {
    const c = calibrate(refsFromObjects([sign]))!;
    expect(c.warnings.some((w) => w.includes('세로'))).toBe(true);
    const m = measureQuad(c, band);
    expect(Math.abs(m.widthMm - 6000) / 6000).toBeLessThan(0.03);
  });

  it('기준이 하나도 없으면 null', () => {
    expect(calibrate([])).toBeNull();
    expect(calibrate(refsFromObjects([obj('x', band)]))).toBeNull();
  });
});

describe('모서리 보정 (AI 평가)', () => {
  // 100×100 회색 이미지, x=60 에 세로 모서리 (왼쪽 밝음, 오른쪽 어두움)
  const w = 100, h = 100;
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = x < 60 ? 220 : 40;

  it('4px 어긋난 세로 선을 모서리에 붙인다', () => {
    const line: RefLine = { objectId: 'o', edge: 'left', kind: 'v', a: [64, 10], b: [64, 90], mm: 1000 };
    const r = snapEdge({ data: gray, width: w, height: h }, line, 8);
    expect(Math.abs(r.a[0] - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.b[0] - 60)).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(Math.abs(r.offset)).toBeCloseTo(4, 0);
  });

  it('모서리가 없는 곳은 신뢰도가 낮고 움직이지 않는다', () => {
    const line: RefLine = { objectId: 'o', edge: 'left', kind: 'v', a: [20, 10], b: [20, 90], mm: 1000 };
    const r = snapEdge({ data: gray, width: w, height: h }, line, 8);
    expect(r.confidence).toBeLessThan(0.2);
    expect(r.a[0]).toBe(20);
  });
});
