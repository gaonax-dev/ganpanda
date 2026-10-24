// 쓰던 단가표 가져오기 (2026-10-24 사용자: "기존에 사용하던 단가를 입력받으면 ai로 이것을 우리의 단가표에 넣어야한다"):
// 엑셀은 여기서 글(시트·줄·칸 = 탭)로 바꿔 보내고, 사진·PDF 는 그대로(base64) — 서버가 Claude API 로 읽어 우리 항목에 맞춘다
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';
import { CATALOG, CATEGORY_LABEL, SHEETS } from './core/catalog';

export interface ImportItem { id: string; price: number; sourceLabel: string; sourcePrice: string; note: string }
export interface ImportResult { items: ImportItem[]; unmatched: { label: string; price: string }[]; left: number }

/** 서버에 보낼 우리 항목 목록 (금액 없는 몸통 제외) */
export function importCatalog() {
  return [
    ...CATALOG.filter((p) => p.unit !== 'none').map((p) => ({ id: p.id, name: p.name, unit: p.unit as 'm2' | 'charCm' | 'ea' | 'm', group: CATEGORY_LABEL[p.category] })),
    ...SHEETS.map((s) => ({ id: s.id, name: s.name, unit: 'm2' as const, group: '시트' })),
  ];
}

/** 엑셀(.xlsx) → 글: 시트마다 머리 + 줄마다 칸을 탭으로 */
export async function xlsxToText(file: File): Promise<string> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  const out: string[] = [];
  for (const { sheet, data } of sheets.slice(0, 10)) {
    out.push(`[시트: ${sheet}]`);
    for (const r of data.slice(0, 2000)) { const line = r.map((c) => (c === null || c === undefined ? '' : String(c))).join('\t').trim(); if (line) out.push(line); }
  }
  return out.join('\n');
}

const toBase64 = async (f: File) => { const b = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** 글 또는 파일(엑셀·CSV·사진·PDF)을 읽게 한다 */
export async function readPriceTable(input: { text?: string; file?: File | null }): Promise<ImportResult> {
  let text = input.text?.trim() ?? '';
  let file: { type: string; data: string } | undefined;
  const f = input.file;
  if (f) {
    const name = f.name.toLowerCase();
    if (name.endsWith('.xlsx')) text = [text, await xlsxToText(f)].filter(Boolean).join('\n');
    else if (name.endsWith('.csv') || name.endsWith('.txt') || f.type.startsWith('text/')) text = [text, await f.text()].filter(Boolean).join('\n');
    else if (f.type === 'application/pdf' || f.type.startsWith('image/')) file = { type: f.type === 'image/jpg' ? 'image/jpeg' : f.type, data: await toBase64(f) };
    else throw new Error('엑셀(.xlsx)·CSV·사진·PDF 를 골라 주세요. (옛 .xls 는 엑셀에서 .xlsx 로 저장해 주세요)');
  }
  const session = loadSession();
  const r = await fetch(`${SERVER_URL}/api/me/prices/import`, { method: 'POST', headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify({ catalog: importCatalog(), ...(text ? { text } : {}), ...(file ? { file } : {}) }) });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.json();
}

export function describeImportError(e: unknown): string {
  if (e instanceof AuthError) {
    let code = '';
    try { code = (JSON.parse(e.message) as { error?: string }).error ?? ''; } catch { /* 글 */ }
    if (code === 'daily_limit') return '오늘 읽기 횟수를 다 썼습니다. 내일 다시 해 주세요.';
    if (code === 'not_configured') return 'AI 읽기가 아직 켜져 있지 않습니다.';
    if (code === 'empty' || code === 'bad_file') return '단가표 글을 붙여 넣거나 파일을 골라 주세요.';
    if (code === 'read_failed') return '읽지 못했습니다. 잠시 뒤 다시 하거나, 표를 글로 붙여 넣어 보세요.';
  }
  return e instanceof Error ? e.message : String(e);
}
