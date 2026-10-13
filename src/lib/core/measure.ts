// 실측 판독: 사용자가 입력한 치수가 사진과 맞는지 검사 (규칙 기반, AI 없음)
import { DEFAULT_FOCAL_RATIO, applyHomography, estimateWallHeight, solveHomography, type Pt } from './homography';
import { measureQuad, type Calibration } from './calibration';

/** 허용 오차 (12%) */
export const TOLERANCE = 0.12;

export interface Sized { quad: Pt[]; widthMm?: number; heightMm?: number }
export interface Size { widthMm: number; heightMm: number }
export interface MeasureWarning { kind: 'aspect' | 'scale'; message: string; expected: Size }
export interface MeasureResult { warnings: MeasureWarning[]; estimate?: Size; reference?: true; /** 기준선으로 쓰인 축 */ refAxes?: ('h' | 'v')[] }

const dev = (a: number, b: number) => Math.abs(a - b) / b;
const mm = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}mm`;
const hasSize = (o: Sized): o is Sized & Size => !!(o.widthMm && o.heightMm);

/** 사각 영역 하나만으로: 가로 기준 사진 원근상 세로가 맞는지 */
export function checkAspect(o: Sized, imgW: number, imgH: number, focalRatio = DEFAULT_FOCAL_RATIO): MeasureWarning | null {
  if (!hasSize(o)) return null;
  const f = focalRatio * Math.max(imgW, imgH);
  let h: number;
  try { h = estimateWallHeight(o.quad, o.widthMm, f, imgW, imgH); } catch { return null; }
  if (!(h > 0) || dev(o.heightMm, h) <= TOLERANCE) return null;
  return {
    kind: 'aspect',
    message: `가로 ${mm(o.widthMm)} 기준 사진상 세로는 약 ${mm(h)}입니다.`,
    expected: { widthMm: o.widthMm, heightMm: h },
  };
}

/** 같은 벽면의 기준 영역(치수 확정)으로 다른 사각 영역의 실제 크기를 잰다 */
export function sizeOnPlane(ref: Sized & Size, quad: Pt[]): Size {
  const { widthMm: w, heightMm: h } = ref;
  const H = solveHomography(ref.quad, [[0, 0], [w, 0], [w, h], [0, h]]);
  const [a, b, c, d] = quad.map((p) => applyHomography(H, p));
  const len = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  return { widthMm: (len(a, b) + len(d, c)) / 2, heightMm: (len(a, d) + len(b, c)) / 2 };
}

export function isValidQuad(q: Pt[]): boolean {
  try { solveHomography([[0, 0], [1, 0], [1, 1], [0, 1]], q); return true; } catch { return false; }
}

/**
 * 사진 한 장의 모든 영역 판독.
 * 기준 = 가로·세로가 모두 입력된 첫 영역(생성 순). 같은 벽면에 있다고 가정한다.
 */
export function measurePhoto<T extends Sized & { id: string; refH?: boolean; refV?: boolean; quad: Pt[] }>(
  objs: T[], imgW: number, imgH: number, calib?: Calibration | null,
): Map<string, MeasureResult> {
  const out = new Map<string, MeasureResult>();
  // 기준선 보정이 적용된 사진: 모든 영역을 기준선 축척으로 잰다
  if (calib) {
    for (const o of objs) {
      const r: MeasureResult = { warnings: [] };
      if (!isValidQuad(o.quad)) { out.set(o.id, r); continue; }
      const est = measureQuad(calib, o.quad);
      r.estimate = est;
      const axes: ('h' | 'v')[] = [];
      if (o.refH) axes.push('h');
      if (o.refV) axes.push('v');
      if (axes.length) { r.reference = true; r.refAxes = axes; }
      const badW = !o.refH && o.widthMm && dev(o.widthMm, est.widthMm) > TOLERANCE;
      const badH = !o.refV && o.heightMm && dev(o.heightMm, est.heightMm) > TOLERANCE;
      if (badW || badH) r.warnings.push({ kind: 'scale', message: `기준선 기준 약 ${mm(est.widthMm)} × ${mm(est.heightMm)}로 보입니다.`, expected: est });
      out.set(o.id, r);
    }
    return out;
  }
  // 찌그러진(행렬 계산 불가) 영역은 기준이 될 수 없다
  const ref = objs.find((o) => hasSize(o) && isValidQuad(o.quad)) as (T & Size) | undefined;
  for (const o of objs) {
    const r: MeasureResult = { warnings: [] };
    if (ref && ref !== o && isValidQuad(o.quad)) {
      const est = sizeOnPlane(ref, o.quad);
      r.estimate = est;
      const bad = (o.widthMm && dev(o.widthMm, est.widthMm) > TOLERANCE) || (o.heightMm && dev(o.heightMm, est.heightMm) > TOLERANCE);
      if (bad) {
        r.warnings.push({
          kind: 'scale',
          message: `기준 영역 대비 약 ${mm(est.widthMm)} × ${mm(est.heightMm)}로 보입니다.`,
          expected: est,
        });
      }
    } else {
      // 기준 영역이 없을 때(또는 자신이 기준일 때)만 단독 비율 검사
      const aspect = checkAspect(o, imgW, imgH);
      if (aspect) r.warnings.push(aspect);
      if (ref === o) r.reference = true;
    }
    out.set(o.id, r);
  }
  return out;
}
