import { describe, expect, it } from 'vitest';
import { applyHomography, projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import { alignQuad, frameOf, gizmoOf, moveFrame, quadOf, resizeFrame, rotateFrame, skewOf } from '../../src/lib/core/manipulator';

// 비스듬히 찍은 벽 (실측 테스트와 같은 합성 카메라)
const imgW = 4000, imgH = 3000, f = 0.75 * imgW, yaw = 0.45;
const pose: CameraPose = (() => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const R = [c, 0, -s, 0, -1, 0, -s, 0, -c];
  const C = [3000, 2000, 8000];
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
})();
const P = (x: number, y: number): Pt => projectPoint(pose, [x, y, 0]);
const wallRect: Pt[] = [[0, 0], [9000, 0], [9000, 6000], [0, 6000]];
const H = solveHomography(wallRect, wallRect.map(([x, y]) => P(x, y))); // 벽 mm → 사진 px
const Hinv = solveHomography(wallRect.map(([x, y]) => P(x, y)), wallRect);
const plane = { H, Hinv, pose };
/** 벽 위 직사각형(mm, 좌하단 x,y / w,h) → 사진 영역 TL,TR,BR,BL */
const rectOn = (x: number, y: number, w: number, h: number): Pt[] => [P(x, y + h), P(x + w, y + h), P(x + w, y), P(x, y)];
const near = (a: Pt[], b: Pt[], tol = 0.5) => a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) < tol);

describe('입체 매니퓰레이터 (2026-10-15 사용자: "입체적 매니퓰레이터로 외곽 바운더리를 바꾸면 위치·방향을 따라가고, 원근 매니퓰레이터로 각도를 맞추게")', () => {
  const sign = rectOn(1000, 3000, 4000, 900);

  it('사진 영역 → 벽면 위 틀(중심·가로·세로·방향), 틀 → 사진 영역이 왕복한다', () => {
    const fr = frameOf(plane, sign);
    expect(fr.w).toBeCloseTo(4000, 0);
    expect(fr.h).toBeCloseTo(900, 0);
    expect(fr.c[0]).toBeCloseTo(3000, 0);
    expect(fr.c[1]).toBeCloseTo(3450, 0);
    expect(fr.ex[0]).toBeCloseTo(1, 5);
    expect(near(quadOf(plane, fr), sign)).toBe(true);
  });

  it('X 화살표로 끌면 벽을 따라 원근에 맞게 옮겨지고(세로 성분은 무시), 가운데 손잡이는 자유롭게', () => {
    const fr = frameOf(plane, sign);
    const moved = quadOf(plane, moveFrame(fr, [2000, 700], 'x'));
    expect(near(moved, rectOn(3000, 3000, 4000, 900))).toBe(true); // 멀어지는 쪽에서 작아지고 기울기도 따라간다
    expect(near(quadOf(plane, moveFrame(fr, [2000, 700], 'z')), rectOn(1000, 3700, 4000, 900))).toBe(true);
    expect(near(quadOf(plane, moveFrame(fr, [2000, 700], 'free')), rectOn(3000, 3700, 4000, 900))).toBe(true);
  });

  it('회전 고리: 중심을 기준으로 끈 각도만큼 벽면 안에서 돈다 (크기 그대로)', () => {
    const fr = frameOf(plane, sign);
    const r = rotateFrame(fr, [fr.c[0] + 1000, fr.c[1]], [fr.c[0], fr.c[1] + 1000]); // 90° 반시계
    expect(r.w).toBeCloseTo(4000, 3);
    expect(r.ex[0]).toBeCloseTo(0, 5);
    expect(Math.abs(r.ex[1])).toBeCloseTo(1, 5);
  });

  it('크기 손잡이: 오른쪽 변을 끌면 왼쪽 변은 그대로, 위 변을 끌면 아래 변은 그대로', () => {
    const fr = frameOf(plane, sign);
    expect(near(quadOf(plane, resizeFrame(fr, 'right', [6000, 3200])), rectOn(1000, 3000, 5000, 900))).toBe(true);
    expect(near(quadOf(plane, resizeFrame(fr, 'top', [2000, 4500])), rectOn(1000, 3000, 4000, 1500))).toBe(true);
  });

  it('원근 어긋남: 설정한 원근의 직사각형이면 0에 가깝고, 손으로 비튼 외곽선은 크다. 맞추기 하면 원근 직사각형이 된다', () => {
    expect(skewOf(plane, sign)).toBeLessThan(0.5);
    const hand: Pt[] = [[sign[0][0], sign[0][1] - 40], sign[1], [sign[2][0] + 30, sign[2][1]], sign[3]];
    expect(skewOf(plane, hand)).toBeGreaterThan(3);
    const fixed = alignQuad(plane, hand);
    expect(skewOf(plane, fixed)).toBeLessThan(0.5);
    // 위치·크기는 거의 유지
    const a = frameOf(plane, hand), b = frameOf(plane, fixed);
    expect(Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1])).toBeLessThan(150);
    expect(b.w / a.w).toBeCloseTo(1, 1);
  });

  it('매니퓰레이터 화살표: X 는 벽 가로, Z 는 벽 위쪽 방향(사진에서 위로), 카메라가 있으면 Y(벽에서 나오는 방향)도', () => {
    const fr = frameOf(plane, sign);
    const g = gizmoOf(plane, fr);
    const L = g.lengthMm;
    expect(Math.hypot(g.x[0] - P(fr.c[0] + L, fr.c[1])[0], g.x[1] - P(fr.c[0] + L, fr.c[1])[1])).toBeLessThan(0.5);
    expect(g.z[1]).toBeLessThan(g.c[1]); // 사진에서 위로
    expect(g.y).toBeDefined();
    expect(g.ring.length).toBeGreaterThan(16);
    expect(gizmoOf({ H, Hinv }, fr).y).toBeUndefined(); // 카메라 없으면 Y 없음
  });

  it('카메라 없는 사진: 사인물 자신의 외곽선이 기준 면이라 왕복·이동이 그 원근을 따른다', () => {
    const own = { H: solveHomography([[0, 1000], [3000, 1000], [3000, 0], [0, 0]], sign), Hinv: solveHomography(sign, [[0, 1000], [3000, 1000], [3000, 0], [0, 0]]) };
    const fr = frameOf(own, sign);
    expect(near(quadOf(own, fr), sign)).toBe(true);
    expect(skewOf(own, sign)).toBeLessThan(0.5);
    const right = quadOf(own, moveFrame(fr, [3000, 0], 'x'));
    expect(near(right.slice(0, 1), [applyHomography(own.H, [3000, 1000])])).toBe(true); // 옮긴 왼쪽 위 = 원래 오른쪽 위
  });
});

describe('원근 매니퓰레이터: 방향 맞추기', async () => {
  const { snapFrame, tiltOf } = await import('../../src/lib/core/manipulator');
  it('면의 축에서 조금(10° 안) 기운 틀은 가까운 축으로 맞추고, 크게 기운(의도한) 것은 그대로', () => {
    const f = { c: [0, 0] as Pt, ex: [Math.cos(0.1), Math.sin(0.1)] as Pt, ey: [Math.sin(0.1), -Math.cos(0.1)] as Pt, w: 1000, h: 500 };
    expect(tiltOf(f)).toBeCloseTo(5.73, 1);
    const s = snapFrame(f);
    expect(s.ex[0]).toBeCloseTo(1, 6); expect(s.ex[1]).toBeCloseTo(0, 6);
    expect(s.ey[1]).toBeCloseTo(-1, 6); // 세로 방향(아래) 유지
    const big = { ...f, ex: [Math.cos(0.5), Math.sin(0.5)] as Pt, ey: [Math.sin(0.5), -Math.cos(0.5)] as Pt };
    expect(snapFrame(big).ex[0]).toBeCloseTo(Math.cos(0.5), 6);
  });
});

describe('3단계: 벽에서 돌려 세우기 (돌출 간판 직각 배치)', async () => {
  const { turnFrameOf, turnedQuad, readTurn, turnAngleAt, outOfWall } = await import('../../src/lib/core/manipulator');
  const sign = rectOn(1000, 3000, 2000, 900);
  const fr = frameOf(plane, sign);

  it('0° 는 원래 외곽선 그대로, 90° 는 벽에 직각 (경첩 변은 벽에 붙은 채)', () => {
    const tf = turnFrameOf(fr, 'left');
    expect(near(turnedQuad(plane, { ...tf, deg: 0 }), sign)).toBe(true);
    const q90 = turnedQuad(plane, { ...tf, deg: 90 });
    // 경첩(왼쪽 변) 그대로
    expect(near([q90[0], q90[3]], [sign[0], sign[3]])).toBe(true);
    // 먼 변은 벽에서 2000mm 나온 3D 점의 투영
    const n = outOfWall(plane);
    const far = projectPoint(pose, [1000, 3900, 2000 * n]);
    expect(Math.hypot(q90[1][0] - far[0], q90[1][1] - far[1])).toBeLessThan(0.5);
  });

  it('오른쪽 경첩: 오른쪽 변이 벽에 붙고 왼쪽으로 뻗는다', () => {
    const tf = turnFrameOf(fr, 'right');
    expect(near(turnedQuad(plane, { ...tf, deg: 0 }), sign)).toBe(true);
    const q = turnedQuad(plane, { ...tf, deg: 60 });
    expect(near([q[1], q[2]], [sign[1], sign[2]])).toBe(true);
  });

  it('돌린 외곽선에서 경첩·크기를 다시 읽는다 (왕복)', () => {
    // 카메라가 사인물 면 안에 있으면(옆에서 정확히 보면) 외곽선이 선이 되어 읽을 수 없다 — 그 경우를 피한 자리
    const fr2 = frameOf(plane, rectOn(500, 3000, 2000, 900));
    for (const hinge of ['left', 'right'] as const) {
      for (const deg of [30, 90]) {
        const tf = { ...turnFrameOf(fr2, hinge), deg };
        const back = readTurn(plane, turnedQuad(plane, tf), { deg, hinge })!;
        expect(back.w).toBeCloseTo(2000, 0);
        expect(back.h).toBeCloseTo(900, 0);
        expect(Math.hypot(back.hinge[0] - tf.hinge[0], back.hinge[1] - tf.hinge[1])).toBeLessThan(1);
      }
    }
  });

  it('포인터 위치 → 돌린 각도 (경첩 높이의 수평면에서), 0~90° 로 제한', () => {
    const tf = turnFrameOf(fr, 'left');
    const n = outOfWall(plane);
    const at = (deg: number) => { const r = (deg * Math.PI) / 180; return projectPoint(pose, [1000 + 1500 * Math.cos(r), 3450, 1500 * Math.sin(r) * n]); };
    expect(turnAngleAt(plane, tf, at(45))).toBeCloseTo(45, 0);
    expect(turnAngleAt(plane, tf, at(90))).toBeCloseTo(90, 0);
    expect(turnAngleAt(plane, tf, at(0))).toBeCloseTo(0, 0);
  });
});

describe('원근 격자 (2026-10-15 사용자: "원근이 틀리다는데 인지가 어렵다. 근처에 격자를 넣어주면")', async () => {
  const { gridOf, niceStep } = await import('../../src/lib/core/manipulator');
  it('면의 축(가로·세로)에 맞춘 격자선: 간격의 배수에 놓이고, 범위를 덮으며, 선 끝은 면 좌표를 투영한 점', () => {
    const g = gridOf(H, [3000, 3450], 2500, 900, 500);
    // 세로선(가로 위치 고정) x = 500..5500, 가로선 y = 2500..4500
    expect(g.v.length).toBe(11);
    expect(g.h.length).toBe(5);
    expect(g.v[0].at).toBe(500);
    expect(g.h[0].at).toBe(2500);
    const [a] = g.v[0].pts;
    const want = applyHomography(H, [500, 2550]);
    expect(Math.hypot(a[0] - want[0], a[1] - want[1])).toBeLessThan(0.5);
  });
  it('보기 좋은 간격: 화면에서 목표 px 에 가까운 50·100·200·250·500·1000·2000mm', () => {
    expect(niceStep(0.05, 24)).toBe(500); // 0.05px/mm → 24px ≈ 480mm
    expect(niceStep(0.5, 24)).toBe(50);
    expect(niceStep(0.012, 24)).toBe(2000);
  });
});
