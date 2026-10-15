import { describe, expect, it } from 'vitest';
import { api, createProject, get, json, login } from './helpers';

const del = (path: string, s: string) => api(path, { method: 'DELETE', headers: { authorization: `Bearer ${s}` } });

describe('프로젝트 그룹 · 상태 · 정산', () => {
  it('로그인한 사람이 그룹을 만들고 목록에서 본다 (오너)', async () => {
    expect((await json('/api/groups', { name: 'x' })).status).toBe(401);
    const s = await login('g-owner@example.com');
    const r = await json('/api/groups', { name: ' 강남점 묶음 ' }, s);
    expect(r.status).toBe(201);
    const { group } = await r.json<{ group: { id: string; name: string; role: string } }>();
    expect(group.name).toBe('강남점 묶음');
    expect(group.role).toBe('owner');
    const list = (await (await get('/api/groups', s)).json<{ groups: { id: string; role: string; canBilling: boolean }[] }>()).groups;
    expect(list.map((g) => g.id)).toEqual([group.id]);
    expect(list[0].canBilling).toBe(true);
    expect((await json('/api/groups', { name: ' ' }, s)).status).toBe(400);
  });

  it('프로젝트를 그룹에 넣고 상태·계약·받은 금액을 고친다 (소유자만). 그룹 보기에 프로젝트와 금액이 나온다', async () => {
    const s = await login('g2@example.com');
    const other = await login('g2-other@example.com');
    const g = (await (await json('/api/groups', { name: 'G' }, s)).json<{ group: { id: string } }>()).group;
    const p = await createProject(s, '카페');
    expect((await json(`/api/projects/${p.id}`, { groupId: g.id, status: 'ongoing', contractAmount: 1_500_000, paidAmount: 500_000 }, other, 'PATCH')).status).toBe(403);
    const r = await json(`/api/projects/${p.id}`, { groupId: g.id, status: 'ongoing', contractAmount: 1_500_000, paidAmount: 500_000 }, s, 'PATCH');
    expect(r.status).toBe(200);
    const { project } = await r.json<{ project: { groupId: string; status: string; contractAmount: number; paidAmount: number } }>();
    expect(project).toMatchObject({ groupId: g.id, status: 'ongoing', contractAmount: 1_500_000, paidAmount: 500_000 });
    expect((await json(`/api/projects/${p.id}`, { status: 'weird' }, s, 'PATCH')).status).toBe(400);
    expect((await json(`/api/projects/${p.id}`, { contractAmount: -1 }, s, 'PATCH')).status).toBe(400);
    // 남의 그룹에는 못 넣는다
    const og = (await (await json('/api/groups', { name: 'OG' }, other)).json<{ group: { id: string } }>()).group;
    expect((await json(`/api/projects/${p.id}`, { groupId: og.id }, s, 'PATCH')).status).toBe(403);
    // 그룹 보기 (오너는 금액 포함)
    const view = await (await get(`/api/groups/${g.id}`, s)).json<{ group: { name: string }; projects: { id: string; status: string; contractAmount?: number; paidAmount?: number }[]; members: unknown[] }>();
    expect(view.projects.map((x) => x.id)).toEqual([p.id]);
    expect(view.projects[0]).toMatchObject({ status: 'ongoing', contractAmount: 1_500_000, paidAmount: 500_000 });
    expect(view.members).toEqual([]);
    // 내 프로젝트 목록에도 그룹·상태·금액
    const mine = (await (await get('/api/projects', s)).json<{ projects: { id: string; groupId: string | null; status: string; paidAmount: number }[] }>()).projects;
    expect(mine.find((x) => x.id === p.id)).toMatchObject({ groupId: g.id, status: 'ongoing', paidAmount: 500_000 });
    // 그룹에서 빼기
    expect((await json(`/api/projects/${p.id}`, { groupId: null }, s, 'PATCH')).status).toBe(200);
    expect((await (await get(`/api/groups/${g.id}`, s)).json<{ projects: unknown[] }>()).projects).toEqual([]);
  });

  it('멤버: 오너가 이메일로 추가. 정산 금액은 오너가 허용한 멤버만 본다. 남은 403', async () => {
    const s = await login('g3@example.com');
    const mSession = await login('g3-member@example.com');
    const stranger = await login('g3-stranger@example.com');
    const g = (await (await json('/api/groups', { name: 'G3' }, s)).json<{ group: { id: string } }>()).group;
    const p = await createProject(s, '본점');
    await json(`/api/projects/${p.id}`, { groupId: g.id, status: 'done', contractAmount: 2_000_000, paidAmount: 2_000_000 }, s, 'PATCH');
    expect((await get(`/api/groups/${g.id}`, mSession)).status).toBe(403);
    expect((await json(`/api/groups/${g.id}/members`, { email: 'nobody@example.com' }, s)).status).toBe(404);
    expect((await json(`/api/groups/${g.id}/members`, { email: 'g3-member@example.com' }, stranger)).status).toBe(403);
    const add = await json(`/api/groups/${g.id}/members`, { email: 'G3-Member@example.com', canBilling: false }, s);
    expect(add.status).toBe(201);
    // 멤버 목록에 그룹이 보이고, 금액은 안 보인다
    const list = (await (await get('/api/groups', mSession)).json<{ groups: { id: string; role: string; canBilling: boolean }[] }>()).groups;
    expect(list).toEqual([expect.objectContaining({ id: g.id, role: 'member', canBilling: false })]);
    let view = await (await get(`/api/groups/${g.id}`, mSession)).json<{ projects: Record<string, unknown>[]; members?: unknown[] }>();
    expect(view.projects[0]).toMatchObject({ id: p.id, status: 'done' });
    expect(view.projects[0].contractAmount).toBeUndefined();
    expect(view.members).toBeUndefined();
    // 오너가 정산 보기를 허용하면 금액이 보인다
    const me = await (await get('/api/me', mSession)).json<{ account: { id: string } }>();
    expect((await json(`/api/groups/${g.id}/members/${me.account.id}`, { canBilling: true }, s, 'PATCH')).status).toBe(200);
    view = await (await get(`/api/groups/${g.id}`, mSession)).json<{ projects: Record<string, unknown>[] }>();
    expect(view.projects[0]).toMatchObject({ contractAmount: 2_000_000, paidAmount: 2_000_000 });
    // 멤버 제거 → 다시 403. 그룹 삭제 → 프로젝트는 그룹 없음
    expect((await del(`/api/groups/${g.id}/members/${me.account.id}`, s)).status).toBe(204);
    expect((await get(`/api/groups/${g.id}`, mSession)).status).toBe(403);
    expect((await del(`/api/groups/${g.id}`, stranger)).status).toBe(403);
    expect((await del(`/api/groups/${g.id}`, s)).status).toBe(204);
    const mine = (await (await get('/api/projects', s)).json<{ projects: { id: string; groupId: string | null }[] }>()).projects;
    expect(mine.find((x) => x.id === p.id)!.groupId).toBeNull();
  });
});
