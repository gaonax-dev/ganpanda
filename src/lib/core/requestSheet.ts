// 견적 요청서 표 (2026-10-22 사용자: "견적요청서 리스트가 있어야 견적이 쉽다"): 실측 보기(가게 사장 프로젝트, 읽기 전용)에서 사인물을 목록으로 —
// 번호·이름·가로×세로(mm)·면적(㎡)·종류·메모, 합계(개수·치수 입력 수·면적)
export interface SheetSign { id: string; name: string; widthMm?: number; heightMm?: number; productId?: string; note?: string }
export interface SheetRow { id: string; no: number; name: string; size: string; area: number; kind: string; memo: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
export function requestSheet(signs: SheetSign[], productName: (id?: string) => string | undefined): { rows: SheetRow[]; total: { count: number; measured: number; area: number } } {
  const rows = signs.map((s, i): SheetRow => {
    const sized = !!(s.widthMm && s.heightMm);
    return {
      id: s.id, no: i + 1, name: s.name,
      size: sized ? `${s.widthMm!.toLocaleString('ko-KR')} × ${s.heightMm!.toLocaleString('ko-KR')}` : '치수 없음',
      area: sized ? r2((s.widthMm! * s.heightMm!) / 1e6) : 0,
      kind: productName(s.productId) ?? '', memo: s.note?.trim() ?? '',
    };
  });
  return { rows, total: { count: rows.length, measured: rows.filter((r) => r.area > 0).length, area: r2(rows.reduce((t, r) => t + r.area, 0)) } };
}
