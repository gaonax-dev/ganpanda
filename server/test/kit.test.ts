// 채널 키트 올리기 (2026-10-31 사용자: "블랜더에서 간판다로 모델 생성해서 보낼수 있는 플러그인 만들수 있나?" → "운영자만, 초안 공개 2단계로 진행해줘"):
// 블렌더 애드온이 업로드 키로 파일(내용 해시 이름)과 초안 목록을 올리고, 운영자가 앱에서 미리 본 뒤 공개·되돌리기
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, get, json, login } from './helpers';

const KEY = 'test-kit-key';
const E = env as unknown as { KIT_UPLOAD_TOKEN?: string; OPERATOR_EMAILS?: string };
const OP = 'kit-operator@example.com';
let prev: string | undefined, prevOps: string | undefined;
beforeEach(() => { prev = E.KIT_UPLOAD_TOKEN; prevOps = E.OPERATOR_EMAILS; E.KIT_UPLOAD_TOKEN = KEY; E.OPERATOR_EMAILS = OP; });
afterEach(() => { E.KIT_UPLOAD_TOKEN = prev; E.OPERATOR_EMAILS = prevOps; });

async function sha(bytes: Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const up = (name: string, body: Uint8Array, key = KEY) => api(`/api/kit/files/${name}`, { method: 'PUT', body, headers: { authorization: `Bearer ${key}` } });
async function file(ext: string, seed: string) { const b = new TextEncoder().encode(`${seed}-${Math.random()}`); const n = `${await sha(b)}.${ext}`; return { n, b }; }
async function draftWith(names: { glb: string; maps: string[] }) {
  return api('/api/kit/draft', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ letter: 'G', variants: [{ id: 'halo', label: '후광', file: names.glb, roles: ['side'], lightmaps: { day: { letters: names.maps[0], wall: names.maps[1], letterIntensity: 1, wallIntensity: 1 }, night: { letters: names.maps[2], wall: names.maps[3], letterIntensity: 2, wallIntensity: 2 } }, size: [0.3, 0.3, 0.1], bytes: 10 }] }) });
}
async function uploadSet() {
  const glb = await file('glb', 'm'); const maps = await Promise.all([0, 1, 2, 3].map((i) => file('webp', `l${i}`)));
  for (const f of [glb, ...maps]) expect((await up(f.n, f.b)).status).toBe(200);
  return { glb: glb.n, maps: maps.map((m) => m.n), glbBytes: glb.b };
}
const operator = () => login(OP);

describe('키트 파일 올리기', () => {
  it('업로드 키가 없거나 틀리면 막고, 내용 해시가 이름과 다르면 거절, 맞으면 저장해 누구나 받는다', async () => {
    const f = await file('glb', 'a');
    expect((await up(f.n, f.b, 'wrong')).status).toBe(401);
    expect((await up(`${'0'.repeat(64)}.glb`, f.b)).status).toBe(400);
    expect((await up('nothex.glb', f.b)).status).toBe(400);
    expect((await up(f.n, f.b)).status).toBe(200);
    const r = await api(`/api/kit/files/${f.n}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(f.b);
    E.KIT_UPLOAD_TOKEN = undefined;
    expect((await up(f.n, f.b)).status).toBe(404);
  });
});

describe('초안 → 공개', () => {
  it('없는 파일을 가리키는 초안은 거절', async () => {
    const r = await draftWith({ glb: `${'a'.repeat(64)}.glb`, maps: [1, 2, 3, 4].map((i) => `${String(i).repeat(64)}.webp`) });
    expect(r.status).toBe(400);
  });
  it('초안은 운영자만 보고, 공개하면 모두에게 — 이전 판으로 되돌릴 수 있다', async () => {
    const s1 = await uploadSet();
    const d1 = await draftWith(s1);
    expect(d1.status).toBe(200);
    const v1 = (await d1.json<{ version: number }>()).version;
    const someone = await login(`kit-${crypto.randomUUID().slice(0, 6)}@example.com`);
    expect((await get('/api/kit/manifest?draft=1', someone)).status).toBe(403);
    const op = await operator();
    const draft = await (await get('/api/kit/manifest?draft=1', op)).json<{ version: number; variants: { file: string }[] }>();
    expect(draft.version).toBe(v1);
    expect(draft.variants[0].file).toBe(s1.glb);
    // 공개는 운영자만
    expect((await json('/api/kit/publish', {}, someone)).status).toBe(403);
    expect((await json('/api/kit/publish', {}, op)).status).toBe(200);
    const pub = await (await get('/api/kit/manifest')).json<{ version: number }>();
    expect(pub.version).toBe(v1);
    // 다음 판 공개 → 되돌리기
    const s2 = await uploadSet();
    const v2 = (await (await draftWith(s2)).json<{ version: number }>()).version;
    expect(v2).toBeGreaterThan(v1);
    await json('/api/kit/publish', {}, op);
    expect((await (await get('/api/kit/manifest')).json<{ version: number }>()).version).toBe(v2);
    const hist = await (await get('/api/kit/history', op)).json<{ versions: number[] }>();
    expect(hist.versions).toEqual(expect.arrayContaining([v1, v2]));
    expect((await json('/api/kit/rollback', { version: v1 }, op)).status).toBe(200);
    const back = await (await get('/api/kit/manifest')).json<{ version: number; variants: { file: string }[] }>();
    expect(back.variants[0].file).toBe(s1.glb);
    expect(back.version).toBeGreaterThan(v2); // 되돌린 것도 새 판 번호 — 기기에 저장된 카드 그림이 다시 그려지게
  });
});
