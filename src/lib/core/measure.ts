// 실측 판독: 사용자가 입력한 치수가 사진과 맞는지 검사 (규칙 기반, AI 없음)
import { DEFAULT_FOCAL_RATIO, applyHomography, estimateWallHeight, solveHomography, type Pt } from './homography';
import { measureQuad, type Calibration } from './calibration';

/** 허용 오차 (12%) */
export const TOLERANCE = 0.12;

export interface Sized { quad: Pt[]; widthMm?: number; heightMm?: number; turn?: unknown }
export interface Size { widthMm: number; heightMm: number }
export interface MeasureWarning { kind: 'aspect' | 'scale'; message: string; expected: Size }
export interface MeasureResult { warnings: MeasureWarning[]; estimate?: Size; /** 자동 기준(치수 입력 첫 영역) */ reference?: true }

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
export function measurePhoto<T extends Sized & { id: string; quad: Pt[] }>(
  objs: T[], imgW: number, imgH: number, calib?: Calibration | null,
  /** 세 면 (2026-10-15 "삼면 구조로 진행해줘"): 벽면이 아닌 면(벽에 직각인 세로면·수평면, 돌려 세운 면)의 사인물은 그 면에서 잰 크기.
   *  undefined = 벽면(벽면에서 잰다), null = 어느 면도 아님(재지 않음). 없으면 예전처럼 돌려 세운 사인물만 뺀다 */
  faceSize?: (o: T) => Size | null | undefined,
): Map<string, MeasureResult> {
  const out = new Map<string, MeasureResult>();
  // 카메라 설정이 있는 사진: 모든 영역을 그 벽면으로 잰다.
  // 치수를 넣은 사인물이 있으면 그 치수로 **축척을 축마다 보정**한다 (2026-10-15 사용자: "원근을 설정했다면 추정이 좋아져야 하는데 오히려 떨어진다"
  // — 카메라의 기준 길이·초점거리 오차가 그대로 추정에 들어가던 문제. 원근(모양)은 카메라, 축척은 실측이 맡는다).
  // 가로·세로 보정 비율이 2배 넘게 다르면 카메라의 벽면이 이 사인물들의 면이 아니라는 뜻 → 기준 영역 방식으로 돌아간다
  if (calib) {
    const raw = new Map<string, Size>();
    // 벽면이 아닌 면의 사인물은 그 면에서 잰다. 면을 모르면(faceSize 없음) 돌려 세운 사인물(turn)은 벽면 위가 아니므로 뺀다
    for (const o of objs) {
      if (!isValidQuad(o.quad)) continue;
      const fs = faceSize?.(o);
      if (fs) raw.set(o.id, fs);
      else if (fs === undefined && !(faceSize === undefined && o.turn)) raw.set(o.id, measureQuad(calib, o.quad));
    }
    const sized = objs.filter((o): o is T & Size => hasSize(o) && raw.has(o.id));
    const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
    const sx = sized.length ? median(sized.map((o) => o.widthMm / raw.get(o.id)!.widthMm)) : 1;
    const sy = sized.length ? median(sized.map((o) => o.heightMm / raw.get(o.id)!.heightMm)) : 1;
    const ratio = sx / sy;
    const usable = isFinite(ratio) && ratio > 0.5 && ratio < 2;
    if (usable) {
      for (const o of objs) {
        const r: MeasureResult = { warnings: [] };
        const m = raw.get(o.id);
        if (!m) { out.set(o.id, r); continue; }
        const est: Size = { widthMm: m.widthMm * sx, heightMm: m.heightMm * sy };
        r.estimate = est;
        if (hasSize(o)) r.reference = true;
        const badW = o.widthMm && dev(o.widthMm, est.widthMm) > TOLERANCE;
        const badH = o.heightMm && dev(o.heightMm, est.heightMm) > TOLERANCE;
        if (badW || badH) r.warnings.push({ kind: 'scale', message: `${sized.length ? '카메라 설정과 입력 치수' : '카메라 설정'} 기준 약 ${mm(est.widthMm)} × ${mm(est.heightMm)}로 보입니다.`, expected: est });
        out.set(o.id, r);
      }
      return out;
    }
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
