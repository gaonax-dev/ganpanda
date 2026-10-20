// D1 백업 파일(d1/<날짜>.json.gz) → SQL. 사용: node scripts/d1-restore.ts <백업.json.gz> > restore.sql (Node 22.6+ 의 TS 실행)
// 그다음 npx wrangler d1 execute ganpanda --remote --file restore.sql — 절차 → docs/server/backup.md
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { sqlFromDump, type D1Dump } from '../src/restoreSql.ts';

const file = process.argv[2];
if (!file) { console.error('사용: node scripts/d1-restore.ts <백업.json.gz>'); process.exit(1); }
const raw = readFileSync(file);
const json = file.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
process.stdout.write(sqlFromDump(JSON.parse(json) as D1Dump));
