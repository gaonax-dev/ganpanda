// 쓰던 단가표를 AI 로 읽어 내 단가표 항목에 맞추기 (2026-10-24 사용자: "기존에 사용하던 단가를 입력받으면 ai로 이것을 우리의 단가표에 넣어야한다"
// → 입력 = 엑셀(앱이 글로 바꿔 보냄)·사진·PDF·글, AI = Claude API). 서버는 읽기만 — 적용은 앱이 확인 표에서 고른 뒤 단가표에 넣는다.
// 카탈로그(우리 항목 id·이름·단위)는 앱이 보낸다 (서버에 카탈로그가 없다). 돌려주는 id 는 그 카탈로그 안의 것만.
import { authenticate } from './auth';
import { json, readJson, text } from './http';

export const IMPORT_PER_DAY = 20;
const MODEL = 'claude-sonnet-5-5';
const MAX_TEXT = 60_000;
const MAX_B64 = 11_500_000; // 파일 8MB 쯤
const FILE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

let claudeFetch: typeof fetch = (input, init) => fetch(input, init);
export function setClaudeFetch(f: typeof fetch | null) { claudeFetch = f ?? ((input, init) => fetch(input, init)); }

// ---- 예비 경로: Cloudflare Workers AI (2026-10-24 사용자: "ai토큰 없으면 클라우드플레아 무료 사용하면되지 않아?" → "예비 경로로 붙여줘") ----
// Claude 가 실패하면(크레딧 부족·인증·과부하) 같은 지시문으로 다시: 글 → 텍스트 모델, 사진 → 비전 모델이 글로 옮긴 뒤 텍스트 모델, PDF → 문서 변환(toMarkdown) 뒤 텍스트 모델
const WA_TEXT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WA_VISION = '@cf/meta/llama-3.2-11b-vision-instruct';
interface WorkersAiLike {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
  toMarkdown(files: { name: string; blob: Blob }[]): Promise<{ data?: string }[]>;
}
let workersAi: WorkersAiLike | null = null;
/** 테스트에서 가짜로 바꿔 끼운다 */
export function setWorkersAi(ai: WorkersAiLike | null) { workersAi = ai; }
const aiOf = (env: Env): WorkersAiLike | null => workersAi ?? (env.AI as unknown as WorkersAiLike | undefined) ?? null;
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function readWithWorkers(env: Env, catalog: CatalogEntry[], textIn: string | null, file: { type: string; data: string } | null): Promise<ImportResult> {
  const ai = aiOf(env);
  if (!ai) throw new Error('no workers ai');
  let body = textIn ?? '';
  if (file?.type === 'application/pdf') {
    const md = await ai.toMarkdown([{ name: 'prices.pdf', blob: new Blob([bytesOf(file.data)], { type: 'application/pdf' }) }]);
    body = [body, md.map((m) => m.data ?? '').join('\n')].filter(Boolean).join('\n');
  } else if (file) {
    const run = () => ai.run(WA_VISION, { image: [...bytesOf(file.data)], prompt: '이 그림의 단가표를 줄마다 "품목<탭>금액·단위" 로 그대로 옮겨 적으세요. 설명 없이 표 내용만.', max_tokens: 2048, temperature: 0.1 });
    let r: unknown;
    try { r = await run(); } catch (e) {
      if (!String(e).includes('5016')) throw e; // 계정당 1회 모델 라이선스 동의 (docScan 과 같음)
      try { await ai.run(WA_VISION, { prompt: 'agree' }); } catch { /* 동의 응답도 5016 */ }
      r = await run();
    }
    body = [body, String((r as { response?: unknown }).response ?? '')].filter(Boolean).join('\n');
  }
  if (!body.trim()) throw new Error('nothing to read');
  const r = await ai.run(WA_TEXT, {
    messages: [
      { role: 'system', content: `${prompt(catalog)}\n\n결과는 JSON 하나만: {"items":[{"id","price","sourceLabel","sourcePrice","note"}],"unmatched":[{"label","price"}]}` },
      { role: 'user', content: `단가표:\n${body.slice(0, MAX_TEXT)}` },
    ],
    max_tokens: 4096, temperature: 0.1,
    response_format: { type: 'json_schema', json_schema: TOOL.input_schema },
  }) as { response?: unknown };
  const out = typeof r.response === 'string' ? JSON.parse(r.response.slice(r.response.indexOf('{'), r.response.lastIndexOf('}') + 1)) : r.response;
  if (!out || typeof out !== 'object') throw new Error('no result');
  return out as ImportResult;
}

export interface CatalogEntry { id: string; name: string; unit: 'm2' | 'charCm' | 'ea' | 'm'; group: string }
export interface ImportItem { id: string; price: number; sourceLabel: string; sourcePrice: string; note: string }
export interface ImportResult { items: ImportItem[]; unmatched: { label: string; price: string }[] }

const UNIT_KO: Record<CatalogEntry['unit'], string> = { m2: '원/㎡', charCm: '원/(글자 1자 × 글자 높이 1cm)', ea: '원/개(1식)', m: '원/m' };

function prompt(catalog: CatalogEntry[]): string {
  return [
    '당신은 한국 간판 업계의 단가표를 읽어 간판다(간판 견적 앱)의 단가 항목에 맞추는 일을 합니다.',
    '첨부(또는 위 글)는 한 간판집이 쓰던 판매 단가표입니다. 각 줄을 아래 "간판다 항목" 중 같은 것에 맞추고, 간판다 단위로 바꾼 단가를 내세요.',
    '',
    '단위 바꾸기:',
    '- 원/㎡: 회배·헤베 = 1㎡. 평당이면 ÷ 3.3058. 가로×세로 기준 금액이면 면적으로 나눔.',
    '- 원/(글자 1자 × 높이 1cm): 채널·스카시처럼 "자당" 가격이 글자 크기별이면 그 가격 ÷ 글자 높이(cm). 크기가 여럿이면 30cm 안팎(가장 흔한 크기)을 쓰고 note 에 적음.',
    '- 원/개(1식), 원/m 는 그대로.',
    '- 부가세 포함·별도 표시가 있으면 note 에만 적고 금액은 표에 적힌 그대로.',
    '',
    '규칙: 확실히 같은 품목일 때만 맞춥니다. 애매하거나 간판다 항목에 없는 줄은 unmatched 에. 한 간판다 항목에 여러 줄이 맞으면 가장 기본(일반) 줄 하나만. 금액은 원 단위 정수.',
    '',
    '간판다 항목 (id | 분류 | 이름 | 단위):',
    ...catalog.map((c) => `${c.id} | ${c.group} | ${c.name} | ${UNIT_KO[c.unit]}`),
  ].join('\n');
}

const TOOL = {
  name: 'price_table',
  description: '단가표를 간판다 항목에 맞춘 결과',
  input_schema: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string', description: '간판다 항목 id' },
        price: { type: 'number', description: '간판다 단위로 바꾼 단가(원)' },
        sourceLabel: { type: 'string', description: '원문 품목 이름' },
        sourcePrice: { type: 'string', description: '원문 금액·단위 그대로' },
        note: { type: 'string', description: '바꾼 방법·주의 (없으면 빈 글)' },
      }, required: ['id', 'price', 'sourceLabel', 'sourcePrice', 'note'] } },
      unmatched: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, price: { type: 'string' } }, required: ['label', 'price'] } },
    },
    required: ['items', 'unmatched'],
  },
};

/** 로컬·E2E (ANTHROPIC_API_KEY = 'fake'): 글에서 항목 이름이 들어간 줄의 첫 숫자를 단가로 */
function fakeRead(textIn: string, catalog: CatalogEntry[]): ImportResult {
  const items: ImportItem[] = [], unmatched: ImportResult['unmatched'] = [];
  for (const line of textIn.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const num = line.replace(/,/g, '').match(/\d{3,}/)?.[0];
    const hit = catalog.find((c) => line.includes(c.name));
    if (hit && num && !items.some((i) => i.id === hit.id)) items.push({ id: hit.id, price: Number(num), sourceLabel: line.split(/[\t:]/)[0].trim(), sourcePrice: num, note: '' });
    else if (num) unmatched.push({ label: line.split(/[\t:]/)[0].trim(), price: num });
  }
  return { items, unmatched };
}

async function readWithClaude(env: Env, catalog: CatalogEntry[], textIn: string | null, file: { type: string; data: string } | null): Promise<ImportResult> {
  const content: unknown[] = [];
  if (file) content.push(file.type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
    : { type: 'image', source: { type: 'base64', media_type: file.type, data: file.data } });
  if (textIn) content.push({ type: 'text', text: `단가표:\n${textIn}` });
  content.push({ type: 'text', text: prompt(catalog) });
  const r = await claudeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name }, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`claude ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json<{ content?: { type: string; name?: string; input?: ImportResult }[] }>();
  const out = j.content?.find((c) => c.type === 'tool_use' && c.name === TOOL.name)?.input;
  if (!out) throw new Error('no result');
  return out;
}

/** 돌아온 결과 다듬기: 카탈로그에 있는 id·0 이상 10억 미만 정수만, 항목당 하나 */
export function cleanResult(raw: ImportResult, catalog: CatalogEntry[]): ImportResult {
  const ids = new Set(catalog.map((c) => c.id));
  const seen = new Set<string>();
  const items: ImportItem[] = [];
  for (const i of Array.isArray(raw?.items) ? raw.items : []) {
    const price = Math.round(Number(i?.price));
    if (typeof i?.id !== 'string' || !ids.has(i.id) || seen.has(i.id) || !Number.isFinite(price) || price < 0 || price >= 1e9) continue;
    seen.add(i.id);
    items.push({ id: i.id, price, sourceLabel: String(i.sourceLabel ?? '').slice(0, 100), sourcePrice: String(i.sourcePrice ?? '').slice(0, 60), note: String(i.note ?? '').slice(0, 200) });
  }
  const unmatched = (Array.isArray(raw?.unmatched) ? raw.unmatched : []).slice(0, 200).map((u) => ({ label: String(u?.label ?? '').slice(0, 100), price: String(u?.price ?? '').slice(0, 60) })).filter((u) => u.label);
  return { items, unmatched };
}

const kstDay = (ts = Date.now()) => new Date(ts + 9 * 3600_000).toISOString().slice(0, 10);

/** POST /api/me/prices/import {catalog, text?, file?: {type, data(base64)}} → {items, unmatched, left} */
export async function handlePriceImport(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method !== 'POST') return text('method not allowed', 405);
  if (!env.ANTHROPIC_API_KEY && !aiOf(env)) return json({ error: 'not_configured' }, 503);
  const b = await readJson<{ catalog?: CatalogEntry[]; text?: string; file?: { type?: string; data?: string } }>(req);
  const catalog = Array.isArray(b?.catalog) ? b.catalog.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && ['m2', 'charCm', 'ea', 'm'].includes(c.unit)).slice(0, 500).map((c) => ({ id: c.id.slice(0, 60), name: c.name.slice(0, 60), unit: c.unit, group: String(c.group ?? '').slice(0, 30) })) : [];
  const textIn = typeof b?.text === 'string' && b.text.trim() ? b.text.slice(0, MAX_TEXT) : null;
  const file = b?.file && typeof b.file.type === 'string' && FILE_TYPES.has(b.file.type) && typeof b.file.data === 'string' && b.file.data.length <= MAX_B64 ? { type: b.file.type, data: b.file.data } : null;
  if (!catalog.length) return json({ error: 'bad_catalog' }, 400);
  if (!textIn && !file) return json({ error: b?.file ? 'bad_file' : 'empty' }, 400);
  // 하루 한도 (비용)
  const day = kstDay();
  const used = await env.DB.prepare("SELECT count FROM ai_usage WHERE account_id = ? AND day = ? AND kind = 'price_import'").bind(me.id, day).first<{ count: number }>();
  if ((used?.count ?? 0) >= IMPORT_PER_DAY) return json({ error: 'daily_limit', limit: IMPORT_PER_DAY }, 429);
  await env.DB.prepare("INSERT INTO ai_usage (account_id, day, kind, count) VALUES (?, ?, 'price_import', 1) ON CONFLICT(account_id, day, kind) DO UPDATE SET count = count + 1").bind(me.id, day).run();
  let raw: ImportResult;
  let engine: 'claude' | 'workers' | 'fake' = 'claude';
  try {
    if (env.ANTHROPIC_API_KEY === 'fake') { raw = fakeRead(textIn ?? '', catalog); engine = 'fake'; }
    else {
      try {
        if (!env.ANTHROPIC_API_KEY) throw new Error('no claude key');
        raw = await readWithClaude(env, catalog, textIn, file);
      } catch (e) {
        console.error('price import: claude failed, workers ai', e instanceof Error ? e.message : String(e));
        raw = await readWithWorkers(env, catalog, textIn, file);
        engine = 'workers';
      }
    }
  } catch (e) {
    console.error('price import failed', e instanceof Error ? e.message : String(e));
    return json({ error: 'read_failed' }, 502);
  }
  return json({ ...cleanResult(raw, catalog), engine, left: IMPORT_PER_DAY - (used?.count ?? 0) - 1 });
}
