// 약관 동의 기록 · 운영자 계정 조치(경고·기간 정지·영구 정지·해제) · 이의 신청 · 탈퇴 시 공유 대화 익명화
// (2026-10-27 사용자: "가입시 약정에 회원가입거부나 해지에 대한 내용이 있나?" → "악의적 사용으로인한 손해가 발생시" → "작성해줘" → "전부 진행해줘")
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { TestClient, until } from './client';
import { api, bizInput, createInvite, createProject, fakeNts, get, json, login } from './helpers';
import { TERMS_VERSION } from '../src/auth';

const mail = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}@example.com`;
const idOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;
beforeEach(() => fakeNts());

describe('약관 동의 기록', () => {
  it('이메일 가입하면 계정에 동의한 약관 버전과 시각이 남는다', async () => {
    const email = mail('trm');
    expect((await json('/api/auth/signup', { email, password: 'secret-1234', name: '김', business: bizInput() })).status).toBe(202);
    const row = await env.DB.prepare('SELECT terms_version, terms_at FROM accounts WHERE email = ?').bind(email).first<{ terms_version: string; terms_at: number }>();
    expect(row?.terms_version).toBe(TERMS_VERSION);
    expect(row?.terms_at).toBeGreaterThan(0);
  });
});

describe('운영자 계정 조치', () => {
  it('경고 → 기간 정지(정지 중엔 API 403 suspended, /api/me 와 이의 신청은 됨) → 해제, 영구 정지, 운영자만', async () => {
    const op = await login('op@example.com'), bad = await login(mail('bad')), other = await login(mail('oth'));
    const badId = await idOf(bad);
    // 검색
    const found = (await (await get(`/api/operator/members?q=${encodeURIComponent(badId)}`, op)).json<{ members: { id: string; status: string }[] }>()).members;
    expect(found[0]).toMatchObject({ id: badId, status: 'active' });
    expect((await get(`/api/operator/members?q=x`, other)).status).toBe(403);
    // 경고: 이용은 그대로
    expect((await json(`/api/operator/members/${badId}/action`, { action: 'warn', reason: '스팸' }, op)).status).toBe(200);
    expect((await get('/api/projects', bad)).status).toBe(200);
    // 7일 정지
    expect((await json(`/api/operator/members/${badId}/action`, { action: 'suspend', days: 7, reason: '반복 스팸' }, op)).status).toBe(200);
    const blocked = await get('/api/projects', bad);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ error: 'suspended', reason: '반복 스팸' });
    const me = (await (await get('/api/me', bad)).json<{ account: { suspension?: { until: number | null; banned: boolean; reason: string } } }>()).account;
    expect(me.suspension).toMatchObject({ banned: false, reason: '반복 스팸' });
    expect(me.suspension!.until!).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    // 이의 신청 (정지 중에도)
    expect((await json('/api/me/appeals', { text: '오해입니다' }, bad)).status).toBe(201);
    const appeals = (await (await get('/api/operator/appeals', op)).json<{ appeals: { id: string; accountId: string; text: string; status: string }[] }>()).appeals;
    const ap = appeals.find((a) => a.accountId === badId)!;
    expect(ap).toMatchObject({ text: '오해입니다', status: 'open' });
    // 받아들이면 해제
    expect((await json(`/api/operator/appeals/${ap.id}`, { decision: 'accept', reply: '해제합니다' }, op)).status).toBe(200);
    expect((await get('/api/projects', bad)).status).toBe(200);
    // 조치 이력
    const hist = (await (await get(`/api/operator/members?q=${badId}`, op)).json<{ members: { actions: { action: string }[] }[] }>()).members[0].actions.map((a) => a.action);
    expect(hist).toEqual(expect.arrayContaining(['warn', 'suspend', 'lift']));
    // 영구 정지
    expect((await json(`/api/operator/members/${badId}/action`, { action: 'ban', reason: '사기' }, op)).status).toBe(200);
    expect(await (await get('/api/projects', bad)).json()).toMatchObject({ error: 'suspended', banned: true });
    expect((await json(`/api/operator/members/${badId}/action`, { action: 'nope' }, op)).status).toBe(400);
  });
});

describe('탈퇴 시 공유 대화 익명화', () => {
  it('다른 회원 프로젝트에 남긴 대화의 이름·아이디를 "탈퇴한 회원"으로 바꾼다 (들어간 적 있는 프로젝트)', async () => {
    const owner = await login(mail('own')), leaver = await login(mail('lv'));
    const leaverId = await idOf(leaver);
    const project = await createProject(owner, '공유 매장');
    const inv = await createInvite(owner, project.id, 'viewer');
    // 떠날 사람이 초대 링크로 들어옴(접근 기록) — 그리고 대화를 남김
    expect((await api(`/api/projects/${project.id}/access?invite=${inv.token}`, { headers: { authorization: `Bearer ${leaver}` } })).status).toBe(200);
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.getArray('messages').push([{ id: 'm1', objectId: 'x', author: '떠날사람', authorId: leaverId, text: '안녕하세요', kind: 'chat', ts: 1 }, { id: 'm2', objectId: 'x', author: '사장', authorId: 'owner', text: '네', kind: 'chat', ts: 2 }]);
    await new Promise((r) => setTimeout(r, 300));
    expect((await api('/api/me', { method: 'DELETE', body: JSON.stringify({ confirm: '삭제' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${leaver}` } })).status).toBeLessThan(300);
    await until(() => (o.doc.getArray('messages').toArray() as { id: string; author: string }[]).find((m) => m.id === 'm1')?.author === '탈퇴한 회원');
    const msgs = o.doc.getArray('messages').toArray() as { id: string; author: string; authorId?: string; text: string }[];
    expect(msgs.find((m) => m.id === 'm1')).toMatchObject({ author: '탈퇴한 회원', authorId: 'deleted', text: '안녕하세요' }); // 글은 거래 기록으로 남는다
    expect(msgs.find((m) => m.id === 'm2')).toMatchObject({ author: '사장' });
    o.close();
  });
});

describe('영구 정지 뒤 탈퇴 — 1년 동안 재가입 거절', () => {
  it('영구 정지된 회원이 탈퇴하면 같은 이메일로 다시 가입할 수 없다(403 banned)', async () => {
    const op = await login('op@example.com');
    const email = mail('ban');
    expect((await json('/api/auth/signup', { email, password: 'secret-1234', name: '김', business: bizInput() })).status).toBe(202);
    const s = await login(email);
    const id = await idOf(s);
    expect((await json(`/api/operator/members/${id}/action`, { action: 'ban', reason: '사기' }, op)).status).toBe(200);
    expect((await api('/api/me', { method: 'DELETE', body: JSON.stringify({ confirm: '삭제' }), headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` } })).status).toBeLessThan(300);
    const again = await json('/api/auth/signup', { email, password: 'secret-1234', name: '김', business: bizInput() });
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ error: 'banned' });
  });
});

// 2026-10-27 사용자: "관리자가 페이지가 없다. 우선 가입 계정을 보고 싶어"
describe('관리자: 가입 계정 목록', () => {
  it('최근 가입 순 계정(종류·요금제·사업자·프로젝트 수·마지막 접속·상태·약관 동의) + 요약 수, 종류 거르기·이어 보기, 운영자만', async () => {
    const op = await login('op@example.com');
    const email = mail('lst');
    expect((await json('/api/auth/signup', { email, password: 'secret-1234', name: '목록사장', business: bizInput() })).status).toBe(202);
    const s = await login(email);
    await createProject(s, '목록 매장');
    const r = await (await get('/api/operator/accounts?limit=200', op)).json<{ accounts: { email: string; name: string; kind: string | null; plan: string; business: { name: string; status: string } | null; projects: number; lastSeenAt: number | null; createdAt: number; status: string; termsVersion: string | null }[]; summary: { total: number; today: number; week: number; shops: number; consumers: number; verified: number; suspended: number }; next: number | null }>();
    const me = r.accounts.find((a) => a.email === email)!;
    expect(me).toMatchObject({ name: '목록사장', plan: 'free', projects: 1, status: 'active', termsVersion: expect.any(String), business: { name: '테스트 상회', status: 'active' } });
    expect(me.lastSeenAt).toBeGreaterThan(0);
    expect(r.summary.total).toBeGreaterThanOrEqual(r.accounts.length > 0 ? 1 : 0);
    expect(r.summary.today).toBeGreaterThanOrEqual(1);
    // 최근 가입 순
    const times = r.accounts.map((a) => a.createdAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // 이어 보기
    const p1 = await (await get('/api/operator/accounts?limit=2', op)).json<{ accounts: { email: string }[]; next: number | null }>();
    expect(p1.accounts).toHaveLength(2);
    expect(p1.next).toBe(2);
    const p2 = await (await get('/api/operator/accounts?limit=2&offset=2', op)).json<{ accounts: { email: string }[] }>();
    expect(p2.accounts[0].email).not.toBe(p1.accounts[0].email);
    // 검색
    const q = await (await get(`/api/operator/accounts?q=${encodeURIComponent(email)}`, op)).json<{ accounts: { email: string }[] }>();
    expect(q.accounts.map((a) => a.email)).toEqual([email]);
    expect((await get('/api/operator/accounts', s)).status).toBe(403);
  });
});
