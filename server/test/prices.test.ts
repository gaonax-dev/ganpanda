import { describe, expect, it } from 'vitest';
import { api, get, json, login } from './helpers';

describe('계정 기본 단가표 (/api/me/prices)', () => {
  it('처음엔 null, 저장하면 그대로 돌려준다', async () => {
    const s = await login(`price-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect(await (await get('/api/me/prices', s)).json()).toEqual({ prices: null });
    const table = { version: 1, products: { 'board-acp': 90000 }, sheets: { 'sh-cut': 30000 }, install: 200000, minimum: 0, rounding: 1000, vatIncluded: true };
    const r = await json('/api/me/prices', { prices: table }, s, 'PUT');
    expect(r.status).toBe(200);
    expect(await (await get('/api/me/prices', s)).json()).toEqual({ prices: table });
  });

  it('로그인 필요, 형식이 틀리거나 너무 크면 400', async () => {
    expect((await get('/api/me/prices')).status).toBe(401);
    const s = await login(`price2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/prices', { prices: 'nope' }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/prices', { prices: { version: 1, products: { a: 'x' } } }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/prices', { prices: { version: 1, products: Object.fromEntries(Array.from({ length: 500 }, (_, i) => ['p' + i, 1])) } }, s, 'PUT')).status).toBe(400);
  });

  it('공급 단가 연결(links)은 문자열 맵만 저장된다 (2026-10-16 한울 단가표)', async () => {
    const s = await login(`price4-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const table = { version: 1, products: {}, sheets: { 'sh-cut': 6000 }, links: { 'sh-cut': 'hanwool:hanwool.cut.돔보/시트' } };
    expect((await json('/api/me/prices', { prices: table }, s, 'PUT')).status).toBe(200);
    expect(await (await get('/api/me/prices', s)).json()).toEqual({ prices: table });
    expect((await json('/api/me/prices', { prices: { version: 1, links: { 'sh-cut': 5 } } }, s, 'PUT')).status).toBe(400);
  });

  it('/api/me 응답에도 prices 가 들어 있다', async () => {
    const s = await login(`price3-${crypto.randomUUID().slice(0, 6)}@example.com`);
    await json('/api/me/prices', { prices: { version: 1, products: {}, sheets: {}, install: 1, minimum: 0, rounding: 1, vatIncluded: false } }, s, 'PUT');
    const me = await (await api('/api/me', { headers: { authorization: `Bearer ${s}` } })).json<{ prices: { install: number } | null }>();
    expect(me.prices?.install).toBe(1);
  });
});
