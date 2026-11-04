// 치수 블록 (2026-11-03 사용자: "같은 크기 사각형으로 나머지 사인물 대략 크기를 정확도 높게 … 모서리 대각으로 같은크기 블록을 넣는거야",
// "설정이 하나인 사각이 두개가 되고", "치수블록은 핫핑크라인으로", "정확도가 향상된면 보라색으로")
import { describe, expect, it } from 'vitest';
import { BLOCK_COLOR, BLOCK_FIT_COLOR, BLOCK_FIT_TOL, blockFits, blockIdOf, blockLines, parseBlockId, predictBlock, snapStart } from '../../src/lib/core/blocks';
import { calibrationOf, signCameraFit, signCameraSetup, solveCamera } from '../../src/lib/core/camera';
import { measureQuad } from '../../src/lib/core/calibration';
import { projectPoint, type CameraPose, type Pt } from '../../src/lib/core/homography';

// 합성 핀홀 카메라 (camera.test 와 같은 모델)
const imgW = 4000, imgH = 3000, f = 3000;
type V3 = [number, number, number];
function truth(yaw: number, pitch: number, C: number[]): CameraPose {
  const base = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
  const R = mul(Rx, mul(Ry, base));
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as V3;
  return { f, R, t, imgW, imgH };
}
const P = truth(0.45, -0.15, [3000, 2500, 9000]);
const proj = (q: V3) => projectPoint(P, q);
/** 벽 위 사각형 (왼쪽 아래 x,h · 가로 w · 세로 hh) → 사진 외곽선 TL,TR,BR,BL */
const rect = (x: number, h: number, w: number, hh: number): Pt[] => ([[x, h + hh], [x + w, h + hh], [x + w, h], [x, h]] as [number, number][]).map(([a, b]) => proj([a, b, 0]));
const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b) / b).toBeLessThan(tol);
const dev = (m: { widthMm: number; heightMm: number }, w: number, h: number) => Math.max(Math.abs(m.widthMm / w - 1), Math.abs(m.heightMm / h - 1));

describe('치수 블록 = 기준 사인물과 같은 크기의 사각 (설정 하나, 사각 여러 개)', () => {
  it('블록의 위·아래 변은 가로 축 선, 좌·우 변은 높이 축 선', () => {
    const b = rect(2000, 1000, 1000, 600);
    const l = blockLines([b]);
    expect(l.x).toEqual([{ a: b[0], b: b[1] }, { a: b[3], b: b[2] }]);
    expect(l.y).toEqual([{ a: b[3], b: b[0] }, { a: b[2], b: b[1] }]);
  });

  it('색: 블록은 형광 초록 선(2026-11-04 "형광색으로"; 처음엔 핫핑크), 정확도를 올린 블록은 보라', () => {
    expect(BLOCK_COLOR).toBe('#39ff14');
    expect(BLOCK_FIT_COLOR).toBe('#a855f7');
  });

  it('블록 id = 사인물 id#b번호 — 조작 손잡이의 가짜 사인물·판독 키. 사인물 id 에 # 이 있어도 마지막 #b 로 푼다', () => {
    expect(blockIdOf('abc', 2)).toBe('abc#b2');
    expect(parseBlockId('abc#b2')).toEqual({ id: 'abc', i: 2 });
    expect(parseBlockId('a#b1#b12')).toEqual({ id: 'a#b1', i: 12 });
    expect(parseBlockId('abc')).toBeNull();
    expect(parseBlockId(null)).toBeNull();
  });

  it('맞음 판정: 지금 원근으로 잰 블록 크기가 사인물 치수와 허용 오차 안이면 맞음 (가로·세로 모두)', () => {
    expect(BLOCK_FIT_TOL).toBe(0.1);
    expect(blockFits({ widthMm: 1050, heightMm: 580 }, { w: 1000, h: 600 })).toBe(true);
    expect(blockFits({ widthMm: 1200, heightMm: 600 }, { w: 1000, h: 600 })).toBe(false);
    expect(blockFits({ widthMm: 1000, heightMm: 700 }, { w: 1000, h: 600 })).toBe(false);
    expect(blockFits(undefined, { w: 1000, h: 600 })).toBe(false);
  });

  it('그리기 시작점이 사인물·블록 꼭짓점 가까이면 그 꼭짓점에 붙는다 (반경 안, 가장 가까운 것)', () => {
    const corners: Pt[] = [[100, 100], [500, 100], [500, 200], [100, 200]];
    expect(snapStart([506, 204], corners, 10)).toEqual({ corner: [500, 200], index: 2 });
    expect(snapStart([520, 220], corners, 10)).toBeNull();
    expect(snapStart([300, 150], corners, 10)).toBeNull();
  });

  it('대각 예측: 꼭짓점에서 끌어 놓으면 그 방향으로 벽 위에 같은 크기 블록이 모서리를 맞대고 놓인다 (원근 반영)', () => {
    const sign = rect(1500, 2200, 2000, 600);
    const sol = solveCamera(signCameraSetup(sign, 2000), imgW, imgH)!;
    // 오른쪽 위 꼭짓점(1)에서 오른쪽 위로 끌면 → 벽 (3500, 2800) 에서 (5500, 3400) 블록
    const want = rect(3500, 2800, 2000, 600);
    const got = predictBlock(sol, sign, 1, proj([4800, 3200, 0]))!;
    for (let i = 0; i < 4; i++) expect(Math.hypot(got[i][0] - want[i][0], got[i][1] - want[i][1])).toBeLessThan(2);
    // 왼쪽 아래 꼭짓점(3)에서 왼쪽 아래로 → (−500, 1600)
    const want2 = rect(-500, 1600, 2000, 600);
    const got2 = predictBlock(sol, sign, 3, proj([0, 1800, 0]))!;
    for (let i = 0; i < 4; i++) expect(Math.hypot(got2[i][0] - want2[i][0], got2[i][1] - want2[i][1])).toBeLessThan(2);
    // 예측한 블록을 그 원근으로 재면 사인물 크기
    const m = measureQuad(calibrationOf(sol), got);
    near(m.widthMm, 2000, 0.01); near(m.heightMm, 600, 0.01);
  });
});

describe('블록의 변을 원근 풀이에 더하면 멀리(2층) 있는 영역의 추정이 좋아진다', () => {
  // 1층 사인물 1000×600 — 꼭짓점이 몇 px 어긋나게 그려짐 (사람 손). 2층 블록은 같은 크기, 사인물에서 대각으로 떨어진 자리
  const jitter: Pt[] = [[3, -2], [-3, 2], [2, 3], [-2, -3]];
  const sign = rect(1500, 2200, 1000, 600).map((p, i) => [p[0] + jitter[i][0], p[1] + jitter[i][1]] as Pt);
  const blocks = [rect(4500, 4600, 1000, 600), rect(2500, 2800, 1000, 600)];
  const window2f = rect(5000, 6000, 1500, 1200);
  it('같은 축 선을 여러 개 넣어도(extra) 정확한 선들이면 두 개만 넣은 것과 같은 풀이', () => {
    const exact = rect(1500, 2200, 1000, 600);
    const a = solveCamera(signCameraSetup(exact, 1000), imgW, imgH)!;
    const b = solveCamera(signCameraSetup(exact, 1000, [rect(4500, 4600, 1000, 600)]), imgW, imgH)!;
    expect(Math.abs(a.f - b.f) / a.f).toBeLessThan(0.01);
    const ma = measureQuad(calibrationOf(a), window2f), mb = measureQuad(calibrationOf(b), window2f);
    expect(Math.abs(ma.widthMm - mb.widthMm) / 1500).toBeLessThan(0.01);
  });
  it('어긋난 사인물만으로 잰 2층 창문보다 블록을 더해 잰 쪽이 참값(1500×1200)에 가깝다', () => {
    const without = signCameraFit(sign, 1000, 600, imgW, imgH)!;
    const withBlocks = signCameraFit(sign, 1000, 600, imgW, imgH, blocks)!;
    expect(withBlocks.extra?.x?.length).toBe(4);
    const e0 = dev(measureQuad(calibrationOf(solveCamera(without, imgW, imgH)!), window2f), 1500, 1200);
    const e1 = dev(measureQuad(calibrationOf(solveCamera(withBlocks, imgW, imgH)!), window2f), 1500, 1200);
    expect(e1).toBeLessThan(e0);
    expect(e1).toBeLessThan(0.05);
  });
  it('블록이 들어간 원근으로 블록 자신을 재면 사인물 크기와 맞는다(보라) — 사인물만의 원근으로는 어긋날 수 있다', () => {
    const withBlocks = solveCamera(signCameraFit(sign, 1000, 600, imgW, imgH, blocks)!, imgW, imgH)!;
    for (const b of blocks) expect(blockFits(measureQuad(calibrationOf(withBlocks), b), { w: 1000, h: 600 })).toBe(true);
  });
});

describe('블록 축 (2026-11-04 "블록은 속성이 사이즈와 축설정만 … 블록은 여러 축에 사용되고")', async () => {
  const { asBlocks, blockLines: lines } = await import('../../src/lib/core/blocks');
  const b = rect(2000, 1000, 1000, 600);
  it('축 정보: 블록 배열과 축 배열을 묶어 읽는다 (축 없음 = 자동)', () => {
    expect(asBlocks([b, b], ['x'])).toEqual([{ q: b, axis: 'x' }, { q: b, axis: undefined }]);
    expect(asBlocks(undefined, undefined)).toEqual([]);
  });
  it('벽면(Y)·자동 블록은 위·아래 변 = 가로 축 선, 좌·우 변 = 높이 축 선', () => {
    expect(lines([{ q: b, axis: 'y' }]).x).toHaveLength(2);
    expect(lines([{ q: b, axis: 'y' }]).y).toHaveLength(2);
  });
  it('옆면(X) 블록은 좌·우 변(수직)만 높이 축 선 — 위·아래 변은 깊이 방향이라 가로 축이 아니다', () => {
    const l = lines([{ q: b, axis: 'x' }]);
    expect(l.x).toHaveLength(0);
    expect(l.y).toEqual([{ a: b[3], b: b[0] }, { a: b[2], b: b[1] }]);
  });
  it('수평(Z) 블록은 벽 축 선에 넣지 않는다', () => {
    const l = lines([{ q: b, axis: 'z' }]);
    expect(l.x).toHaveLength(0); expect(l.y).toHaveLength(0);
  });
});
