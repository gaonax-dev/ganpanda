import { describe, expect, it } from 'vitest';
import { api, createInvite, createProject, get, json, login } from './helpers';

describe('프로젝트', () => {
  it('로그인해야 만들 수 있고, 만든 사람이 소유자', async () => {
    expect((await json('/api/projects', { name: 'x' })).status).toBe(401);
    const s = await login('owner@example.com');
    const r = await json('/api/projects', { name: '  간판다 카페 ' }, s);
    expect(r.status).toBe(201);
    const { project } = await r.json<{ project: { id: string; name: string; role: string } }>();
    expect(project.id).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
    expect(project.name).toBe('간판다 카페');
    expect(project.role).toBe('owner');
  });

  it('이름이 비면 400', async () => {
    const s = await login('owner2@example.com');
    expect((await json('/api/projects', { name: '  ' }, s)).status).toBe(400);
  });

  it('내 프로젝트 목록 (최근 만든 순), 남의 것은 안 보임', async () => {
    const a = await login('a@example.com');
    const b = await login('b@example.com');
    await createProject(a, '첫째');
    await createProject(a, '둘째');
    await createProject(b, '남의 것');
    const list = (await (await get('/api/projects', a)).json<{ projects: { name: string }[] }>()).projects;
    expect(list.map((p) => p.name)).toEqual(['둘째', '첫째']);
  });

  it('이름 변경·삭제는 소유자만', async () => {
    const a = await login('a2@example.com');
    const b = await login('b2@example.com');
    const p = await createProject(a);
    expect((await json(`/api/projects/${p.id}`, { name: '새 이름' }, b, 'PATCH')).status).toBe(403);
    expect((await json(`/api/projects/${p.id}`, { name: '새 이름' }, a, 'PATCH')).status).toBe(200);
    expect((await api(`/api/projects/${p.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${b}` } })).status).toBe(403);
    expect((await api(`/api/projects/${p.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${a}` } })).status).toBe(204);
    expect((await get(`/api/projects/${p.id}/access`, a)).status).toBe(404);
  });
});

describe('초대 링크', () => {
  it('소유자가 역할을 정해 만들고, 링크는 앱 주소 + room + invite', async () => {
    const a = await login('inv@example.com');
    const p = await createProject(a);
    const inv = await createInvite(a, p.id, 'viewer');
    const u = new URL(inv.url);
    expect(u.origin).toBe('http://localhost:5199');
    expect(u.searchParams.get('room')).toBe(p.id);
    expect(u.searchParams.get('invite')).toBe(inv.token);
    expect(inv.role).toBe('viewer');
    expect((await json(`/api/projects/${p.id}/invites`, { role: 'admin' }, a)).status).toBe(400);
  });

  it('소유자가 아니면 만들 수 없다', async () => {
    const a = await login('inv2@example.com');
    const b = await login('inv3@example.com');
    const p = await createProject(a);
    expect((await json(`/api/projects/${p.id}/invites`, { role: 'editor' }, b)).status).toBe(403);
  });

  it('초대 토큰으로 프로젝트 정보와 역할을 조회한다 (로그인 불필요)', async () => {
    const a = await login('inv4@example.com');
    const p = await createProject(a, '초대 매장');
    const inv = await createInvite(a, p.id, 'editor');
    const r = await get(`/api/invites/${inv.token}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ project: { id: p.id, name: '초대 매장' }, role: 'editor' });
    expect((await get('/api/invites/' + 'x'.repeat(43))).status).toBe(404);
  });

  it('목록 조회와 폐기 (폐기된 링크는 404)', async () => {
    const a = await login('inv5@example.com');
    const p = await createProject(a);
    const inv = await createInvite(a, p.id, 'viewer');
    const list = (await (await get(`/api/projects/${p.id}/invites`, a)).json<{ invites: { id: string; role: string; revoked: boolean }[] }>()).invites;
    expect(list).toHaveLength(1);
    expect(list[0].role).toBe('viewer');
    expect(list[0].revoked).toBe(false);
    expect(JSON.stringify(list)).not.toContain(inv.token);
    expect((await api(`/api/projects/${p.id}/invites/${list[0].id}`, { method: 'DELETE', headers: { authorization: `Bearer ${a}` } })).status).toBe(204);
    expect((await get(`/api/invites/${inv.token}`)).status).toBe(404);
  });
});

describe('방 접근 권한', () => {
  it('소유자 세션 = owner, 초대 토큰 = 그 역할, 둘 다 없으면 401, 등록 안 된 방은 404', async () => {
    const a = await login('acc@example.com');
    const p = await createProject(a);
    const inv = await createInvite(a, p.id, 'viewer');
    expect(await (await get(`/api/projects/${p.id}/access`, a)).json()).toMatchObject({ role: 'owner', project: { id: p.id } });
    expect(await (await get(`/api/projects/${p.id}/access?invite=${inv.token}`)).json()).toMatchObject({ role: 'viewer' });
    expect((await get(`/api/projects/${p.id}/access`)).status).toBe(401);
    expect((await get(`/api/projects/not-registered-room/access`, a)).status).toBe(404);
  });

  it('다른 프로젝트의 초대 토큰으로는 접근할 수 없다', async () => {
    const a = await login('acc2@example.com');
    const p1 = await createProject(a);
    const p2 = await createProject(a);
    const inv = await createInvite(a, p1.id, 'editor');
    expect((await get(`/api/projects/${p2.id}/access?invite=${inv.token}`)).status).toBe(403);
  });
});
