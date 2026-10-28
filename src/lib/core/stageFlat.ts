// 3D 단계에서 3D 로 바꿀 필요가 없는 사진 (2026-10-29 사용자: "시트처럼 2d인 경우는 3d로 변환할 이유가 없다")
// 시트·현수막처럼 납작한 것만 있거나 분류 없는 외곽선뿐이면 3D 합성 대신 2D 그림 그대로 — WebGL·합성 그림을 만들지 않는다
import { categoryOf } from './catalog';

const FLAT = new Set(['sheet', 'banner']);
export function needs3d(objs: { quad: unknown[]; sheetIds: string[]; productId?: string; parts?: { kind: string }[] }[]): boolean {
  return objs.some((o) => {
    const g = categoryOf(o);
    return o.quad.length >= 3 && g !== null && !FLAT.has(g);
  });
}
