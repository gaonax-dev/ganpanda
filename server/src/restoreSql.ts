// D1 백업(JSON) → SQL (2026-10-21 백업 2단계). scripts/d1-restore.ts 가 써서 `wrangler d1 execute --file` 로 넣는다 → docs/server/backup.md
export interface D1Dump { at: number; tables: Record<string, Record<string, unknown>[]> }

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Array.isArray(v)) return `X'${v.map((b) => Number(b).toString(16).padStart(2, '0')).join('')}'`; // BLOB(바이트 배열)
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** 표마다 행을 INSERT OR REPLACE — 이미 있는 행은 백업 값으로, 없는 행은 새로 */
export function sqlFromDump(dump: D1Dump): string {
  let out = '';
  for (const [table, rows] of Object.entries(dump.tables)) {
    for (const r of rows) {
      const cols = Object.keys(r);
      out += `INSERT OR REPLACE INTO ${q(table)} (${cols.map(q).join(',')}) VALUES (${cols.map((c) => lit(r[c])).join(',')});\n`;
    }
  }
  return out;
}
