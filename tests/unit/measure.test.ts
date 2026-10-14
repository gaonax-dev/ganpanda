import { describe, expect, it } from 'vitest';
import { checkAspect, measurePhoto, sizeOnPlane } from '../../src/lib/core/measure';
import { DEFAULT_FOCAL_RATIO, projectPoint, solveHomography, type CameraPose, type Pt } from '../../src/lib/core/homography';
import type { Calibration } from '../../src/lib/core/calibration';

// 합성 사진: 기본 화각(장변 × 0.75)으로 비스듬히 찍은 벽
const imgW = 4000, imgH = 3000, f = DEFAULT_FOCAL_RATIO * imgW;
const yaw = 0.45;
const pose: CameraPose = (() => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // world(Y 위) → camera(y 아래), y축 회전
  const R = [c, 0, -s, 0, -1, 0, -s, 0, -c];
  const C = [3000, 2000, 8000];
  const t = [0, 1, 2].map((i) => -(R[i * 3] * C[0] + R[i * 3 + 1] * C[1] + R[i * 3 + 2] * C[2])) as [number, number, number];
  return { f, R, t, imgW, imgH };
})();
/** 벽 위 직사각형(mm, 좌하단 x,y / 크기 w,h)을 사진 사각 영역으로 */
const rectOnWall = (x: number, y: number, w: number, h: number): Pt[] =>
  ([[x, y + h], [x + w, y + h], [x + w, y], [x, y]] as Pt[]).map(([a, b]) => projectPoint(pose, [a, b, 0]));

describe('실측 판독', () => {
  const sign = rectOnWall(1000, 2500, 4000, 900);

  it('입력 치수의 가로세로 비율이 사진과 맞으면 경고 없음', () => {
    expect(checkAspect({ quad: sign, widthMm: 4000, heightMm: 900 }, imgW, imgH)).toBeNull();
  });

  it('세로를 크게 잘못 입력하면 비율 경고 + 사진 기준 추정 세로', () => {
    const w = checkAspect({ quad: sign, widthMm: 4000, heightMm: 1500 }, imgW, imgH);
    expect(w?.kind).toBe('aspect');
    expect(w!.expected.heightMm).toBeCloseTo(900, -1);
  });

  it('같은 벽의 기준 영역으로 다른 영역의 실제 크기를 잰다', () => {
    const door = rectOnWall(5500, 0, 1200, 2100);
    const s = sizeOnPlane({ quad: sign, widthMm: 4000, heightMm: 900 }, door);
    expect(s.widthMm).toBeCloseTo(1200, 3);
    expect(s.heightMm).toBeCloseTo(2100, 3);
  });

  it('사진 전체 판독: 추정 치수 제공 + 기준과 어긋나는 입력에 경고', () => {
    const objs = [
      { id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 },
      { id: 'door', quad: rectOnWall(5500, 0, 1200, 2100) }, // 치수 미입력
      { id: 'band', quad: rectOnWall(0, 3600, 6000, 600), widthMm: 9000, heightMm: 900 }, // 1.5배 과대 입력
    ];
    const r = measurePhoto(objs, imgW, imgH);
    expect(r.get('sign')!.warnings).toEqual([]);
    expect(r.get('door')!.estimate!.widthMm).toBeCloseTo(1200, 3);
    expect(r.get('door')!.warnings).toEqual([]);
    const band = r.get('band')!;
    expect(band.warnings.map((w) => w.kind)).toContain('scale');
    expect(band.estimate!.widthMm).toBeCloseTo(6000, 3);
  });

  it('기준 영역이 있으면 비율 경고 없이 기준 대비 경고 하나만 낸다', () => {
    const objs = [
      { id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 },
      // 실제 1200×2100 인데 비율도 크기도 틀리게 입력
      { id: 'door', quad: rectOnWall(5500, 0, 1200, 2100), widthMm: 2100, heightMm: 1200 },
    ];
    expect(measurePhoto(objs, imgW, imgH).get('door')!.warnings.map((w) => w.kind)).toEqual(['scale']);
  });

  it('기준이 하나도 없으면 추정도 경고도 없다', () => {
    const r = measurePhoto([{ id: 'a', quad: sign }], imgW, imgH);
    expect(r.get('a')).toEqual({ warnings: [] });
  });
});

describe('퇴화된(찌그러진) 영역', () => {
  const flat: Pt[] = [[0, 0], [100, 0], [200, 0], [300, 0]];
  it('판독이 예외 없이 해당 영역만 건너뛴다', () => {
    const objs = [
      { id: 'ref', quad: flat, widthMm: 1000, heightMm: 500 },
      { id: 'b', quad: [[0, 0], [10, 0], [10, 10], [0, 10]] as Pt[], widthMm: 100, heightMm: 100 },
    ];
    expect(() => measurePhoto(objs, imgW, imgH)).not.toThrow();
  });
});

describe('카메라 설정 + 입력 치수 (2026-10-15 사용자: "원근을 설정했다면 길이 추정이 좋아져야 하는데 오히려 떨어진다")', () => {
  const sign = rectOnWall(1000, 2500, 4000, 900);
  const door = rectOnWall(5500, 0, 1200, 2100);
  /** 카메라 보정: 사진 px → 벽 mm. scaleErr 만큼 축척이 틀린(기준 길이를 잘못 잰) 카메라 */
  const calibWith = (scaleErr: number, ratioErr = 1): Calibration => {
    const wall: Pt[] = [[0, 0], [9000, 0], [9000, 4000], [0, 4000]];
    const px = wall.map(([x, y]) => projectPoint(pose, [x, y, 0]));
    const H = solveHomography(px, wall.map(([x, y]) => [x * scaleErr * ratioErr, y * scaleErr]));
    return { H, sx: 1, sy: 1, metric: true, perRef: [], warnings: [] };
  };
  it('축척이 20% 틀린 카메라라도 치수를 넣은 사인물이 있으면 그 치수로 축척을 보정해 다른 영역을 맞게 잰다', () => {
    const objs = [{ id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 }, { id: 'door', quad: door }];
    const r = measurePhoto(objs, imgW, imgH, calibWith(1.2));
    expect(r.get('door')!.estimate!.widthMm).toBeCloseTo(1200, 0);
    expect(r.get('door')!.estimate!.heightMm).toBeCloseTo(2100, 0);
    expect(r.get('sign')!.warnings).toEqual([]);
    expect(r.get('sign')!.reference).toBe(true);
    // 보정 없이 카메라만 쓰면 20% 틀린다 (치수 없는 사진)
    expect(measurePhoto([{ id: 'door', quad: door }], imgW, imgH, calibWith(1.2)).get('door')!.estimate!.widthMm).toBeCloseTo(1440, 0);
  });
  it('가로·세로 축척이 따로 틀려도(초점거리 오차) 축마다 보정한다', () => {
    const objs = [{ id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 }, { id: 'door', quad: door }];
    const r = measurePhoto(objs, imgW, imgH, calibWith(1.1, 1.15));
    expect(r.get('door')!.estimate!.widthMm).toBeCloseTo(1200, 0);
    expect(r.get('door')!.estimate!.heightMm).toBeCloseTo(2100, 0);
  });
  it('치수를 넣은 사인물이 둘이면 둘 다 기준이 되고, 서로 어긋나면 경고한다', () => {
    const objs = [
      { id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 },
      { id: 'door', quad: door, widthMm: 1200, heightMm: 2100 },
      { id: 'band', quad: rectOnWall(0, 3600, 6000, 600), widthMm: 9000, heightMm: 900 }, // 1.5배 과대 입력
    ];
    const r = measurePhoto(objs, imgW, imgH, calibWith(1.2));
    expect(r.get('sign')!.warnings).toEqual([]);
    expect(r.get('door')!.warnings).toEqual([]);
    expect(r.get('band')!.warnings.map((w) => w.kind)).toEqual(['scale']);
    expect(r.get('band')!.estimate!.widthMm).toBeCloseTo(6000, -1);
  });
  it('카메라의 벽면이 엉뚱해(가로·세로 보정 비율이 2배 넘게 다름) 치수와 맞지 않으면 기준 영역 방식으로 돌아간다', () => {
    const objs = [{ id: 'sign', quad: sign, widthMm: 4000, heightMm: 900 }, { id: 'door', quad: door }];
    const r = measurePhoto(objs, imgW, imgH, calibWith(1, 3));
    expect(r.get('door')!.estimate!.widthMm).toBeCloseTo(1200, 0);
    expect(r.get('door')!.estimate!.heightMm).toBeCloseTo(2100, 0);
  });
});
