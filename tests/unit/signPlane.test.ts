import { describe, expect, it } from 'vitest';
import { applyHomography, projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import { placeOnWall, projectP, projectionFromPlane, signPlaneOf, type WallPlane } from '../../src/lib/core/wallPlane';
import { frameOf, scaleFrame, turnFrameOf, turnedQuad, quadOf } from '../../src/lib/core/manipulator';
import type { SignObject } from '../../src/lib/core/model';

const imgW = 4000, imgH = 3000, f = 3000, yaw = 0.45;
const pose: CameraPose = (() => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = [c, 0, -s, 0, -1, 0, -s, 0, -c];
  const C = [3000, 2000, 8000];
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
})();
const P = (x: number, y: number): Pt => projectPoint(pose, [x, y, 0]);
const wr: Pt[] = [[0, 0], [9000, 0], [9000, 6000], [0, 6000]];
const cal: WallPlane = { H: solveHomography(wr, wr.map(([x, y]) => P(x, y))), Hinv: solveHomography(wr.map(([x, y]) => P(x, y)), wr), source: 'calibration', pose };
const rectOn = (x: number, y: number, w: number, h: number): Pt[] => [P(x, y + h), P(x + w, y + h), P(x + w, y), P(x, y)];
const obj = (o: Partial<SignObject>): SignObject => ({ id: 'o', photoId: 'p', name: 'x', shape: 'rect', quad: rectOn(1000, 3000, 4000, 900), sheetIds: [], createdAt: 0, ...o });

describe('3D 각도는 원근 설정을 우선 (2026-10-15 사용자: "원근 설정되었고 오브젝트를 원근 각도에 맞춘 거면 각도는 이쪽에 우선")', () => {
  it('원근에 맞는 외곽선이면 입력 치수가 틀려도 원근 설정의 면·카메라로 그린다 (크기는 사진에서 잰 값)', () => {
    const o = obj({ widthMm: 6000, heightMm: 600 }); // 실제 4000×900 인데 잘못 입력
    const pl = signPlaneOf(o, cal)!;
    expect(pl.source).toBe('calibration');
    expect(pl.pose).toBe(pose);
    const at = placeOnWall(pl, o);
    expect(at.w).toBeCloseTo(4000, 0);
    expect(at.h).toBeCloseTo(900, 0);
  });
  it('원근에서 비튼 외곽선이면 사인물 자신의 면 (그린 자리에 맞물림 우선)', () => {
    const q = rectOn(1000, 3000, 4000, 900);
    const hand: Pt[] = [[q[0][0], q[0][1] - 60], q[1], [q[2][0] + 40, q[2][1]], q[3]];
    expect(signPlaneOf(obj({ quad: hand, widthMm: 4000, heightMm: 900 }), cal)!.source).toBe('reference');
  });
  it('원근 설정이 없으면 자신의 면', () => {
    expect(signPlaneOf(obj({ widthMm: 4000, heightMm: 900 }), null)!.source).toBe('reference');
  });
  it('벽에서 돌려 세운 사인물: 원근 카메라를 돌린 면으로 — 면의 네 꼭짓점이 외곽선에 정확히 투영되고 크기도 사진에서 잰 값', () => {
    for (const hinge of ['left', 'right'] as const) {
      const tf = { ...turnFrameOf(frameOf(cal, rectOn(500, 3000, 2000, 900)), hinge), deg: 90 };
      const q = turnedQuad(cal, tf);
      const o = obj({ quad: q, widthMm: 3000, heightMm: 500, turn: { deg: 90, hinge } });
      const pl = signPlaneOf(o, cal)!;
      expect(pl.pose).toBeDefined();
      const at = placeOnWall(pl, o);
      expect(at.w).toBeCloseTo(2000, 0);
      expect(at.h).toBeCloseTo(900, 0);
      const Pm = projectionFromPlane(pl, imgW, imgH);
      const back = q.map((p) => applyHomography(pl.Hinv, p));
      back.forEach((b, i) => { const r = projectP(Pm, [b[0], b[1], 0])!; expect(Math.hypot(r[0] - q[i][0], r[1] - q[i][1])).toBeLessThan(0.5); });
      // 사인물 가로(TL→TR)가 면의 +x 방향 (글자가 뒤집히지 않게)
      expect(back[1][0]).toBeGreaterThan(back[0][0]);
    }
  });
});

describe('크기 모드: 비율 유지 확대·축소', () => {
  it('왼쪽 아래 꼭짓점을 고정하고 오른쪽 위로 끈 거리 비율만큼 가로·세로를 같이', () => {
    const fr = frameOf(cal, rectOn(1000, 3000, 4000, 900));
    const s = scaleFrame(fr, [1000 + 8000, 3000 + 1800]); // 두 배
    expect(s.w).toBeCloseTo(8000, 0);
    expect(s.h).toBeCloseTo(1800, 0);
    const q = quadOf(cal, s);
    const bl = rectOn(1000, 3000, 8000, 1800)[3];
    expect(Math.hypot(q[3][0] - bl[0], q[3][1] - bl[1])).toBeLessThan(0.5);
  });
});

describe('상자 가이드 (2026-10-15 사용자: "격자도 어렵다. 정육면체로 가이드를 줄 수 있나? 두께가 있는 것만 문제")', async () => {
  const { boxGuideOf } = await import('../../src/lib/core/manipulator');
  const { thicknessOf } = await import('../../src/lib/core/render');
  it('면 위 네 꼭짓점을 카메라 쪽으로 깊이만큼 밀어낸 상자: 뒷면 = 외곽선, 앞면 = 3D 점의 투영', () => {
    const Pm = projectionFromPlane(cal, imgW, imgH);
    const base: Pt[] = [[1000, 3900], [5000, 3900], [5000, 3000], [1000, 3000]];
    const g = boxGuideOf(Pm, base, 900)!;
    expect(g.back.length).toBe(4);
    const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
    expect(near(g.back[0], P(1000, 3900))).toBe(true);
    // 앞면은 카메라 쪽(깊이가 줄어드는 쪽) z
    const zToward = [900, -900].find((z) => { const d = (x: number) => Pm[8] * 1000 + Pm[9] * 3900 + Pm[10] * x + Pm[11]; return d(z) < d(0); })!;
    expect(near(g.front[0], projectPoint(pose, [1000, 3900, zToward]))).toBe(true);
  });
  it('두께: 입력 두께 > 입체 설정 > 종류 기본, 시트·분류 없음은 0 (가이드 없음)', () => {
    expect(thicknessOf(obj({ productId: 'board-flex' }))).toBe(150);
    expect(thicknessOf(obj({ productId: 'board-flex', depthMm: 220 }))).toBe(220);
    expect(thicknessOf(obj({ productId: 'board-galva', options: { channel: '전광 채널' } }))).toBeGreaterThan(0);
    expect(thicknessOf(obj({ sheetIds: ['sh-cut'] }))).toBe(0);
    expect(thicknessOf(obj({}))).toBe(0);
  });
});

describe('3D 상자는 항상 카메라 쪽으로 (2026-10-15 사용자: "정면 페이스가 사라졌다")', async () => {
  const { zTowardCamera } = await import('../../src/lib/core/wallPlane');
  it('면 좌표의 +z 가 카메라 쪽이면 1, 벽 안쪽이면 -1 (그때는 상자를 뒤집어 앞면이 카메라를 보게)', () => {
    const Pm = projectionFromPlane(cal, imgW, imgH);
    const s = zTowardCamera(Pm, [3000, 3450]);
    const depth = (z: number) => Pm[8] * 3000 + Pm[9] * 3450 + Pm[10] * z + Pm[11];
    expect(depth(s * 100)).toBeLessThan(depth(0));
    // z 를 뒤집은 투영이면 부호도 뒤집힌다
    const flipped = Pm.map((v, i) => (i % 4 === 2 ? -v : v));
    expect(zTowardCamera(flipped, [3000, 3450])).toBe(-s);
  });
});

describe('자신의 면으로 그릴 때도 입력 가로는 3D 각도에 영향 없음 (2026-10-15 측면 사진: 6400×600 입력, 그린 비율 8.3:1 → 글자 앞면이 돌아가 사라짐)', async () => {
  const { poseOfPlane } = await import('../../src/lib/core/wallPlane');
  const quad: Pt[] = [[940, 881], [4685, 994], [4678, 1431], [931, 1338]];
  it('입력 가로가 달라도 면의 회전(포즈)은 같고, 거의 정면이다. 세로는 입력 세로(mm)', () => {
    const a = signPlaneOf(obj({ quad, widthMm: 6400, heightMm: 600 }), null)!;
    const b = signPlaneOf(obj({ quad, widthMm: 4000, heightMm: 600 }), null)!;
    const pa = poseOfPlane(a, 5712, 4284), pb = poseOfPlane(b, 5712, 4284);
    pa.R.forEach((v, i) => expect(v).toBeCloseTo(pb.R[i], 6));
    // 벽 법선(R 의 3열)이 카메라 축과 이루는 각 < 25°
    const nz = Math.abs(pa.R[8]);
    expect((Math.acos(Math.min(1, nz)) * 180) / Math.PI).toBeLessThan(25);
    expect(placeOnWall(a, { quad }).h).toBeCloseTo(600, 0);
  });
});
