// 색 라이브러리 (2026-10-17 사용자: "색상관리가 중요하다 … 라이브러리에 저장해서 꺼내쓴다")
import { describe, expect, it } from 'vitest';
import { api, get, json, login } from './helpers';

const card = { id: 'c1', kind: '시트', name: '버건디', hex: '#7a1f2e', supplier: '3M', code: '1080-G13', createdAt: 1 };

describe('계정 색 라이브러리 (/api/me/colors)', () => {
  it('처음엔 null, 저장하면 그대로 돌려주고 /api/me 에도 들어 있다', async () => {
    const s = await login(`color-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect(await (await get('/api/me/colors', s)).json()).toEqual({ colors: null });
    const lib = { version: 1, colors: [card] };
    expect((await json('/api/me/colors', { colors: lib }, s, 'PUT')).status).toBe(200);
    expect(await (await get('/api/me/colors', s)).json()).toEqual({ colors: lib });
    const me = await (await api('/api/me', { headers: { authorization: `Bearer ${s}` } })).json<{ colors: { colors: { name: string }[] } | null }>();
    expect(me.colors?.colors[0].name).toBe('버건디');
  });
  it('로그인 필요, 형식이 틀리면 400 (종류·hex·이름 길이·개수)', async () => {
    expect((await get('/api/me/colors')).status).toBe(401);
    const s = await login(`color2-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await json('/api/me/colors', { colors: 'nope' }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/colors', { colors: { version: 1, colors: [{ ...card, kind: '유리' }] } }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/colors', { colors: { version: 1, colors: [{ ...card, hex: 'red' }] } }, s, 'PUT')).status).toBe(400);
    expect((await json('/api/me/colors', { colors: { version: 1, colors: Array.from({ length: 301 }, (_, i) => ({ ...card, id: 'c' + i })) } }, s, 'PUT')).status).toBe(400);
  });
});
