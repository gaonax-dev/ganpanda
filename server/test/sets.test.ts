// 세트 라이브러리 (2026-10-19 레이어 구조 4단계)
import { describe, expect, it } from 'vitest';
import { get, json, login } from './helpers';

const set = { id: 's1', name: '제목 묶음', frame: { w: 6000, h: 900 }, layers: [{ id: 'c', kind: 'channel', spec: { type: 'ch-front' }, box: { x: 0, y: 0, w: 0, h: 0 }, children: [] }], createdAt: 1 };

describe('/api/me/sets', () => {
  it('처음엔 null, 저장하면 그대로', async () => {
    const s = await login(`set-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect(await (await get('/api/me/sets', s)).json()).toEqual({ sets: null });
    const lib = { version: 1, sets: [set] };
    expect((await json('/api/me/sets', { sets: lib }, s, 'PUT')).status).toBe(200);
    expect(await (await get('/api/me/sets', s)).json()).toEqual({ sets: lib });
  });
  it('로그인 필요, 형식이 틀리면 400', async () => {
    expect((await get('/api/me/sets')).status).toBe(401);
    const s = await login(`set2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/sets', { sets: { version: 1, sets: [{ ...set, layers: [] }] } }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/sets', { sets: { version: 1, sets: [{ ...set, name: '' }] } }, s, 'PUT')).status).toBe(400);
  });
});
