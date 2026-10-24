// 멤버는 메일의 가입 링크로 (2026-10-24 사용자: "맴버는 메일로 가입링크 들어오기로") — 이메일 가입의 사업자 확인 없이, 링크를 연 이메일 = 확인된 이메일
import { describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { handleTeam } from '../src/team';
import { api, ensureAccount, get, json, login } from './helpers';

const rnd = () => crypto.randomUUID().slice(0, 8);
const del = (path: string, s: string) => api(path, { method: 'DELETE', headers: { authorization: `Bearer ${s}` } });
const tokenOf = (link: string) => new URL(link).searchParams.get('team')!;
type Team = { members: { email: string; canBilling: boolean }[]; invites: { email: string; canBilling: boolean }[] };

describe('멤버 초대 메일', () => {
  it('가입 안 한 이메일 → 202 가입 링크(/login?team=), 목록에 대기 중. 링크 정보(초대한 사람·이메일) → 비밀번호만으로 가입(사업자 없이) → 바로 로그인되고 팀 멤버', async () => {
    const owner = await login(`own-${rnd()}@example.com`);
    await json('/api/me', { name: '한울광고' }, owner, 'PATCH');
    const email = `staff-${rnd()}@example.com`;
    const r = await json('/api/me/team', { email: email.toUpperCase(), canBilling: true }, owner);
    expect(r.status).toBe(202);
    const { link, invite } = await r.json<{ link: string; invite: { email: string } }>();
    expect(invite.email).toBe(email);
    expect(link).toMatch(/^http:\/\/localhost:5199\/login\?team=[A-Za-z0-9_-]{32,}$/);
    const team = await (await get('/api/me/team', owner)).json<Team>();
    expect(team.invites).toEqual([expect.objectContaining({ email, canBilling: true })]);
    expect(team.members).toEqual([]);

    const info = await (await get(`/api/team-invite/${tokenOf(link)}`)).json<{ email: string; ownerName: string }>();
    expect(info).toMatchObject({ email, ownerName: '한울광고' });

    const s = await json('/api/auth/signup', { email, password: 'staff-pass-1', name: '김직원', teamInvite: tokenOf(link) });
    expect(s.status).toBe(200);
    const { session, account } = await s.json<{ session: string; account: { email: string } }>();
    expect(account.email).toBe(email);
    expect((await get('/api/me', session)).status).toBe(200);
    expect((await json('/api/auth/login', { email, password: 'staff-pass-1' })).status).toBe(200); // 이메일 인증 끝난 계정
    const after = await (await get('/api/me/team', owner)).json<Team>();
    expect(after.members).toEqual([expect.objectContaining({ email, canBilling: true })]);
    expect(after.invites).toEqual([]);
    // 링크는 한 번만
    expect((await json('/api/auth/signup', { email, password: 'x-pass-123', teamInvite: tokenOf(link) })).status).toBe(410);
  });

  it('링크의 이메일과 다른 이메일로는 가입 못 한다(403), 없는 링크 404, 만료 410', async () => {
    const owner = await login(`own2-${rnd()}@example.com`);
    const email = `s2-${rnd()}@example.com`;
    const { link } = await (await json('/api/me/team', { email }, owner)).json<{ link: string }>();
    expect((await json('/api/auth/signup', { email: `other-${rnd()}@example.com`, password: 'abcd1234', teamInvite: tokenOf(link) })).status).toBe(403);
    expect((await get(`/api/team-invite/${'x'.repeat(43)}`)).status).toBe(404);
    await env.DB.prepare('UPDATE team_invites SET expires_at = ? WHERE email = ?').bind(Date.now() - 1, email).run();
    expect((await get(`/api/team-invite/${tokenOf(link)}`)).status).toBe(410);
    expect((await json('/api/auth/signup', { email, password: 'abcd1234', teamInvite: tokenOf(link) })).status).toBe(410);
  });

  it('초대받은 뒤 다른 길(카카오·기존 계정 로그인)로 그 이메일 계정에 들어오면 자동으로 팀에 들어간다', async () => {
    const owner = await login(`own3-${rnd()}@example.com`);
    const email = `s3-${rnd()}@example.com`;
    expect((await json('/api/me/team', { email }, owner)).status).toBe(202);
    await login(email); // 계정이 생기고 로그인
    const team = await (await get('/api/me/team', owner)).json<Team>();
    expect(team.members.map((m) => m.email)).toEqual([email]);
    expect(team.invites).toEqual([]);
  });

  it('대기 중 초대도 멤버 한도에 센다, 다시 보내면 새 링크(한도 안 셈), 취소하면 링크가 죽는다', async () => {
    const owner = await login(`own4-${rnd()}@example.com`); // 무료 2명
    const a = `a-${rnd()}@example.com`, b = `b-${rnd()}@example.com`;
    const first = (await (await json('/api/me/team', { email: a }, owner)).json<{ link: string }>()).link;
    expect((await json('/api/me/team', { email: b }, owner)).status).toBe(202);
    const c = await json('/api/me/team', { email: `c-${rnd()}@example.com` }, owner);
    expect(c.status).toBe(403);
    const again = await json('/api/me/team', { email: a }, owner);
    expect(again.status).toBe(202);
    const second = (await again.json<{ link: string }>()).link;
    expect((await get(`/api/team-invite/${tokenOf(first)}`)).status).toBe(404); // 예전 링크는 버림
    expect((await del(`/api/me/team/invites/${encodeURIComponent(a)}`, owner)).status).toBe(204);
    expect((await get(`/api/team-invite/${tokenOf(second)}`)).status).toBe(404);
    expect((await (await get('/api/me/team', owner)).json<Team>()).invites.map((i) => i.email)).toEqual([b]);
  });

  it('이미 가입된 이메일은 예전처럼 바로 멤버(201), 이미 가입된 이메일로 초대 가입하면 409', async () => {
    const owner = await login(`own5-${rnd()}@example.com`);
    const email = `s5-${rnd()}@example.com`;
    await ensureAccount(email);
    expect((await json('/api/me/team', { email }, owner)).status).toBe(201);
  });

  it('운영 경로: 초대 메일을 보낸다 (제목에 초대한 사람, 링크는 응답에 없음)', async () => {
    const send = vi.fn(async (_m: unknown) => ({ messageId: 'm1' }));
    const ownerEmail = `own6-${rnd()}@example.com`;
    const s = await login(ownerEmail);
    const e = { ...env, AUTH_DEV_LINK: '', APP_URL: 'https://ganpanda.co.kr', EMAIL: { send } } as unknown as Env;
    const r = await handleTeam(new Request('http://sync/api/me/team', { method: 'POST', body: JSON.stringify({ email: `s6-${rnd()}@example.com` }), headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` } }), e, '/api/me/team');
    expect(r.status).toBe(202);
    expect(JSON.stringify(await r.json())).not.toContain('team=');
    const msg = send.mock.calls[0][0] as unknown as { subject: string; text: string };
    expect(msg.subject).toContain('멤버');
    expect(msg.text).toMatch(/https:\/\/ganpanda\.co\.kr\/login\?team=/);
  });
});
