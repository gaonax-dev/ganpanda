// 사양 글 개인 사전 (2026-10-18 V1): 내 규칙 CRUD, 같은 말의 뜻을 계정 수로 추천
import { describe, expect, it } from 'vitest';
import { api, get, json, login } from './helpers';

const rule = (phrase: string, id: string) => ({ phrase, meaning: [{ kind: 'channel', id, label: `채널: ${id}` }] });
const del = (s: string, phrase: string) => api('/api/me/spec-rules', { method: 'DELETE', body: JSON.stringify({ phrase }), headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` } });

describe('/api/me/spec-rules', () => {
  it('규칙을 저장·갱신·삭제하고 내 목록으로 돌려준다', async () => {
    const s = await login(`rule-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect(await (await get('/api/me/spec-rules', s)).json()).toEqual({ rules: [] });
    expect((await json('/api/me/spec-rules', rule('뒷광', 'ch-halo'), s, 'PUT')).status).toBe(200);
    expect((await json('/api/me/spec-rules', rule('  뒷광 ', 'ch-both'), s, 'PUT')).status).toBe(200); // 같은 말(공백 정리) → 갱신
    const list = await (await get('/api/me/spec-rules', s)).json<{ rules: { phrase: string; meaning: { id: string }[] }[] }>();
    expect(list.rules).toEqual([{ phrase: '뒷광', meaning: [expect.objectContaining({ id: 'ch-both' })] }]);
    expect((await del(s, '뒷광')).status).toBe(200);
    expect(await (await get('/api/me/spec-rules', s)).json()).toEqual({ rules: [] });
  });
  it('로그인 필요, 형식이 틀리면 400', async () => {
    expect((await get('/api/me/spec-rules')).status).toBe(401);
    const s = await login(`rule2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/spec-rules', { phrase: '', meaning: [] }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/spec-rules', { phrase: 'a', meaning: [{ kind: 'note', label: 'x' }] }, s, 'PUT')).status).toBe(400); // 메모는 규칙이 아니다
    expect((await json('/api/me/spec-rules', { phrase: 'a'.repeat(61), meaning: rule('x', 'ch-halo').meaning }, s, 'PUT')).status).toBe(400);
  });
  it('추천: 같은 말에 여러 계정이 정한 뜻을 계정 수 순으로 (대세)', async () => {
    const phrase = `뒷광-${crypto.randomUUID().slice(0, 6)}`;
    const a = await login(`sa-${crypto.randomUUID().slice(0, 6)}@example.com`), b = await login(`sb-${crypto.randomUUID().slice(0, 6)}@example.com`), c = await login(`sc-${crypto.randomUUID().slice(0, 6)}@example.com`);
    await json('/api/me/spec-rules', rule(phrase, 'ch-halo'), a, 'PUT');
    await json('/api/me/spec-rules', rule(phrase, 'ch-halo'), b, 'PUT');
    await json('/api/me/spec-rules', rule(phrase, 'ch-both'), c, 'PUT');
    await json('/api/me/spec-rules', rule(phrase, 'ch-halo'), a, 'PUT'); // 같은 계정이 다시 저장해도 한 표
    const r = await (await get(`/api/spec-rules/suggest?phrase=${encodeURIComponent(phrase)}`, a)).json<{ suggestions: { meaning: { id: string }[]; count: number }[] }>();
    expect(r.suggestions.map((x) => [x.meaning[0].id, x.count])).toEqual([['ch-halo', 2], ['ch-both', 1]]);
    expect((await get('/api/spec-rules/suggest?phrase=')).status).toBe(401);
  });
});

// V2 (2026-10-19): 전국 기본값 = 대세
describe('/api/spec-rules/defaults', async () => {
  const { env } = await import('cloudflare:test');
  const { recomputeDefault } = await import('../src/specRules');
  const logins = (n: number) => Promise.all(Array.from({ length: n }, () => login(`d-${crypto.randomUUID().slice(0, 8)}@example.com`)));
  it('5곳이 같은 뜻을 정하면 기본값, 다른 뜻은 3곳 앞서고 30일 지나야 바뀐다', async () => {
    const phrase = `광${crypto.randomUUID().slice(0, 6)}`;
    const a = await logins(4);
    for (const s of a) await json('/api/me/spec-rules', rule(phrase, 'ch-halo'), s, 'PUT');
    const d0 = await (await get('/api/spec-rules/defaults', a[0])).json<{ defaults: { phrase: string }[] }>();
    expect(d0.defaults.find((d) => d.phrase === phrase)).toBeUndefined(); // 4곳은 아직
    const fifth = (await logins(1))[0];
    await json('/api/me/spec-rules', rule(phrase, 'ch-halo'), fifth, 'PUT');
    const d1 = await (await get('/api/spec-rules/defaults', a[0])).json<{ defaults: { phrase: string; meaning: { id: string }[]; count: number }[] }>();
    expect(d1.defaults.find((d) => d.phrase === phrase)).toMatchObject({ count: 5, meaning: [expect.objectContaining({ id: 'ch-halo' })] });
    // 다른 뜻 8곳 (3곳 앞섬) — 하지만 30일 전이 아니면 그대로
    const b = await logins(8);
    for (const s of b) await json('/api/me/spec-rules', rule(phrase, 'ch-both'), s, 'PUT');
    expect((await (await get('/api/spec-rules/defaults', a[0])).json<{ defaults: { phrase: string; meaning: { id: string }[] }[] }>()).defaults.find((d) => d.phrase === phrase)!.meaning[0].id).toBe('ch-halo');
    // 30일 지난 것으로 두고 다시 세면 대세를 따라 바뀐다
    await env.DB.prepare('UPDATE spec_defaults SET since = ? WHERE phrase = ?').bind(Date.now() - 31 * 86_400_000, phrase).run();
    await recomputeDefault(env, phrase);
    expect((await (await get('/api/spec-rules/defaults', a[0])).json<{ defaults: { phrase: string; meaning: { id: string }[]; count: number }[] }>()).defaults.find((d) => d.phrase === phrase)).toMatchObject({ count: 8, meaning: [expect.objectContaining({ id: 'ch-both' })] });
  });
});
