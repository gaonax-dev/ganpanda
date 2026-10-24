// 쓰던 단가표 AI 읽기 (2026-10-24 "기존에 사용하던 단가를 입력받으면 ai로 이것을 우리의 단가표에 넣어야한다" → Claude API)
import { afterEach, describe, expect, it } from 'vitest';
import { json, login } from './helpers';
import { cleanResult, IMPORT_PER_DAY, setClaudeFetch, setWorkersAi } from '../src/priceImport';

const catalog = [
  { id: 'board-galva', name: '갈바', unit: 'm2', group: '간판' },
  { id: 'ch-front', name: '전광 채널', unit: 'charCm', group: '채널' },
];
let seen: { url: string; body: { model: string; tools: { name: string }[]; messages: { content: { type: string; text?: string; source?: { media_type: string } }[] }[] }; headers: Headers } | null = null;
const reply = (input: unknown) => setClaudeFetch(async (url, init) => {
  seen = { url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) };
  return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'price_table', input }] }), { headers: { 'content-type': 'application/json' } });
});
afterEach(() => { setClaudeFetch(null); setWorkersAi(null); seen = null; });

describe('단가표 AI 읽기', () => {
  it('글을 보내면 Claude 에 카탈로그와 함께 묻고(도구 강제), 카탈로그에 있는 id 만·정수 단가로 돌려준다', async () => {
    reply({ items: [
      { id: 'board-galva', price: 65000.4, sourceLabel: '갈바 간판', sourcePrice: '회배 65,000', note: '' },
      { id: 'nope', price: 1, sourceLabel: 'x', sourcePrice: '1', note: '' },
      { id: 'ch-front', price: -5, sourceLabel: '채널', sourcePrice: '-', note: '' },
    ], unmatched: [{ label: '현수막', price: '15,000' }] });
    const s = await login(`pi-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const r = await json('/api/me/prices/import', { catalog, text: '갈바 간판\t회배 65,000\n현수막\t15,000' }, s);
    expect(r.status).toBe(200);
    const out = await r.json<{ items: { id: string; price: number }[]; unmatched: { label: string }[]; left: number }>();
    expect(out.items).toEqual([expect.objectContaining({ id: 'board-galva', price: 65000 })]);
    expect(out.unmatched).toEqual([{ label: '현수막', price: '15,000' }]);
    expect(out.left).toBe(IMPORT_PER_DAY - 1);
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen!.headers.get('x-api-key')).toBe('test-claude');
    expect(seen!.body.tools[0].name).toBe('price_table');
    const texts = seen!.body.messages[0].content.map((c) => c.text ?? '').join('\n');
    expect(texts).toContain('board-galva | 간판 | 갈바 | 원/㎡');
    expect(texts).toContain('갈바 간판\t회배 65,000');
  });

  it('사진·PDF 는 그림·문서로 보낸다, 모르는 파일 형식·빈 입력은 400, 하루 한도 429', async () => {
    reply({ items: [], unmatched: [] });
    const s = await login(`pi2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/prices/import', { catalog, file: { type: 'application/pdf', data: 'JVBERi0x' } }, s)).status).toBe(200);
    expect(seen!.body.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });
    expect((await json('/api/me/prices/import', { catalog, file: { type: 'image/jpeg', data: '/9j/' } }, s)).status).toBe(200);
    expect(seen!.body.messages[0].content[0]).toMatchObject({ type: 'image' });
    expect((await json('/api/me/prices/import', { catalog, file: { type: 'application/zip', data: 'x' } }, s)).status).toBe(400);
    expect((await json('/api/me/prices/import', { catalog, text: '  ' }, s)).status).toBe(400);
    for (let i = 2; i < IMPORT_PER_DAY; i++) await json('/api/me/prices/import', { catalog, text: 'a' }, s);
    const over = await json('/api/me/prices/import', { catalog, text: 'a' }, s);
    expect([over.status, (await over.json<{ error: string }>()).error]).toEqual([429, 'daily_limit']);
  });

  it('Claude 가 실패하면(크레딧 부족 등) Cloudflare Workers AI 로 다시 읽는다 — engine: workers (2026-10-24 "예비 경로로 붙여줘")', async () => {
    setClaudeFetch(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }), { status: 400 }));
    const calls: string[] = [];
    setWorkersAi({
      run: async (model: string, input: { messages?: { content: string }[]; prompt?: string }) => {
        calls.push(model);
        if (model.includes('vision')) return { response: '갈바 간판\t70,000' };
        expect(input.messages?.map((m) => m.content).join('\n')).toContain('board-galva | 간판 | 갈바');
        return { response: { items: [{ id: 'board-galva', price: 70000, sourceLabel: '갈바 간판', sourcePrice: '70,000', note: '' }], unmatched: [] } };
      },
      toMarkdown: async () => [{ data: '| 갈바 | 70,000 |' }],
    });
    const s = await login(`pi4-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const t = await (await json('/api/me/prices/import', { catalog, text: '갈바 간판 70000' }, s)).json<{ engine: string; items: { id: string; price: number }[] }>();
    expect(t).toMatchObject({ engine: 'workers', items: [{ id: 'board-galva', price: 70000 }] });
    expect(calls.at(-1)).toContain('llama-3.3');
    await json('/api/me/prices/import', { catalog, file: { type: 'image/png', data: 'iVBORw0K' } }, s);
    expect(calls.slice(-2)[0]).toContain('vision'); // 사진: 비전 모델이 글로 옮기고 → 텍스트 모델
    const pdf = await (await json('/api/me/prices/import', { catalog, file: { type: 'application/pdf', data: 'JVBERi0x' } }, s)).json<{ engine: string }>();
    expect(pdf.engine).toBe('workers'); // PDF: 문서 변환 → 텍스트 모델
  });

  it('Claude 가 성공하면 engine: claude', async () => {
    reply({ items: [], unmatched: [] });
    const s = await login(`pi5-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await (await json('/api/me/prices/import', { catalog, text: '갈바 1' }, s)).json<{ engine: string }>()).engine).toBe('claude');
  });

  it('둘 다 실패하면 502 read_failed', async () => {
    setClaudeFetch(async () => new Response('x', { status: 529 }));
    setWorkersAi({ run: async () => { throw new Error('ai down'); }, toMarkdown: async () => [] });
    const s = await login(`pi3-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/prices/import', { catalog, text: '갈바 1000' }, s)).status).toBe(502);
  });

  it('cleanResult: 같은 항목은 처음 하나만', () => {
    expect(cleanResult({ items: [{ id: 'board-galva', price: 1, sourceLabel: '', sourcePrice: '', note: '' }, { id: 'board-galva', price: 2, sourceLabel: '', sourcePrice: '', note: '' }], unmatched: [] }, catalog as never).items.map((i) => i.price)).toEqual([1]);
  });
});
