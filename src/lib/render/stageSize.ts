// 3D 단계 저장 그림(합성 JPEG) 크기 (2026-11-05 사용자: "확대할때 3d 업데이트 안되서 깍두기 보임" → "맥앱에서만 그런거 같은데"):
// 실시간 3D 가 준비되기 전에는 이 그림이 보인다 — 긴 변 1280(가로 기준)이라 10배 확대에서 계단이었다 → 데스크톱(합성은 데스크톱만) 긴 변 2560, 원본보다 크게는 안 함
export const STAGE_EXPORT_LONG = 2560;
export function stageExportSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, STAGE_EXPORT_LONG / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
