// 사업자 확인 (2026-10-21 결정): 국세청 진위확인 → 계정에 사업자, 번호는 계정 사이에 유일, 폐업 재조회
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { recheckBusinesses, setNtsFetch, validBizNo, RECHECK_MS } from '../src/business';
import { createProject, get, json, login } from './helpers';

type Route = { url: string; status: number; body: unknown; seen?: unknown };
let routes: Route[] = [];
const mock = (url: string, body: unknown, status = 200) => { const r = { url, body, status }; routes.push(r); return r; };
beforeEach(() => {
  routes = [];
  setNtsFetch(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const r = routes.find((x) => url.startsWith(x.url));
    if (!r) return new Response('no mock for ' + url, { status: 500 });
    r.seen = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
});
const VALIDATE = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';
const STATUS = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const ok = (valid: '01' | '02', cd = '01') => ({ data: [{ valid, status: { b_stt_cd: cd } }] });
/** 9자리 + 검증 자릿수 — 테스트마다 다른 번호 (D1 은 파일 안에서 이어진다) */
const bno = (nine: string) => { const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0; for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i]; sum += Math.floor((Number(nine[8]) * 5) / 10); return nine + String((10 - (sum % 10)) % 10); };
const inputFor = (nine: string) => ({ no: bno(nine), ownerName: '홍길동', startDate: '2020-01-05', name: '간판집' });
const input = { no: '220-81-62517', ownerName: '홍길동', startDate: '2020-01-05', name: '간판집' };
const me = async (s: string) => (await (await get('/api/me', s)).json<{ business: unknown }>()).business;

describe('진위확인 → 계정에 사업자', () => {
  it('일치(01)하면 저장되고 /api/me 에 business 가 붙는다 (번호는 숫자만, 개업일 YYYYMMDD, 키는 URL 에)', async () => {
    const s = await login('biz1@example.com');
    const m = mock(VALIDATE, ok('01'));
    const r = await json('/api/me/business', input, s, 'PUT');
    expect(r.status).toBe(200);
    const { business } = await r.json<{ business: { no: string; name: string; status: string; startDate: string } }>();
    expect(business).toMatchObject({ no: '2208162517', name: '간판집', ownerName: '홍길동', startDate: '20200105', status: 'active' });
    expect(m.seen).toEqual({ businesses: [{ b_no: '2208162517', start_dt: '20200105', p_nm: '홍길동', p_nm2: '', b_nm: '간판집', corp_no: '', b_sector: '', b_type: '', b_adr: '' }] });
    expect(await me(s)).toMatchObject({ no: '2208162517' });
  });
  it('불일치(02)면 400 mismatch, 등록 안 된 번호면 not_registered, 검증 자릿수가 틀리면 bad_input (국세청 안 부름)', async () => {
    const s = await login('biz2@example.com');
    const inp = inputFor('123456789');
    mock(VALIDATE, ok('02'));
    expect((await json('/api/me/business', inp, s, 'PUT')).status).toBe(400);
    expect(await (await json('/api/me/business', inp, s, 'PUT')).json()).toEqual({ error: 'mismatch' });
    routes = []; mock(VALIDATE, { data: [{ valid: '02', status: { b_stt_cd: '', b_stt: '' } }] });
    expect(await (await json('/api/me/business', inp, s, 'PUT')).json()).toEqual({ error: 'not_registered' });
    routes = [];
    expect(await (await json('/api/me/business', { ...inp, no: inp.no.slice(0, 9) + String((Number(inp.no[9]) + 1) % 10) }, s, 'PUT')).json()).toEqual({ error: 'bad_input' });
    expect(await me(s)).toBeNull();
  });
  it('다른 계정이 쓰는 번호는 409 taken — 같은 계정은 다시 확인해 덮어쓴다', async () => {
    const a = await login('biz3a@example.com'), b = await login('biz3b@example.com');
    const inp = inputFor('300000001');
    mock(VALIDATE, ok('01'));
    expect((await json('/api/me/business', inp, a, 'PUT')).status).toBe(200);
    expect(await (await json('/api/me/business', inp, b, 'PUT')).json()).toEqual({ error: 'taken' });
    expect((await json('/api/me/business', { ...inp, name: '새 상호' }, a, 'PUT')).status).toBe(200);
    expect(await me(a)).toMatchObject({ name: '새 상호' });
  });
  it('폐업(03) 상태도 저장되고 상태로 보인다; DELETE 로 뗀다', async () => {
    const s = await login('biz4@example.com');
    mock(VALIDATE, ok('01', '03'));
    expect(await (await json('/api/me/business', inputFor('400000001'), s, 'PUT')).json()).toMatchObject({ business: { status: 'closed' } });
    expect((await json('/api/me/business', {}, s, 'DELETE')).status).toBe(200);
    expect(await me(s)).toBeNull();
  });
  it('제안 페이지 접근 정보에 소유자의 확인된 사업자(상호·상태)가 붙는다', async () => {
    const s = await login('biz5@example.com');
    const p = await createProject(s);
    mock(VALIDATE, ok('01'));
    await json('/api/me/business', inputFor('500000001'), s, 'PUT');
    const a = await (await get(`/api/projects/${p.id}/access`, s)).json<{ business?: { name: string; status: string } }>();
    expect(a.business).toEqual({ name: '간판집', status: 'active' });
  });
});

describe('재조회 (월 1회 cron)', () => {
  it('30일 넘은 것만 상태조회로 묶어 확인하고 폐업이면 상태를 바꾼다', async () => {
    const s = await login('biz6@example.com');
    const inp = inputFor('600000001');
    mock(VALIDATE, ok('01'));
    await json('/api/me/business', inp, s, 'PUT');
    expect(await recheckBusinesses(env)).toBe(0); // 아직 안 됨
    const m = mock(STATUS, { data: [{ b_no: inp.no, b_stt_cd: '03' }] });
    expect(await recheckBusinesses(env, Date.now() + RECHECK_MS + 1000)).toBeGreaterThanOrEqual(1);
    expect((m.seen as { b_no: string[] }).b_no).toContain(inp.no);
    expect(await me(s)).toMatchObject({ status: 'closed' });
  });
});

describe('검증 자릿수', () => {
  it('국세청 알고리즘', () => {
    expect(validBizNo('2208162517')).toBe(true);
    expect(validBizNo('2208162518')).toBe(false);
  });
});
