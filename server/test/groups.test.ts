import { describe, expect, it } from 'vitest';
import { api, createProject, get, json, login } from './helpers';

const del = (path: string, s: string) => api(path, { method: 'DELETE', headers: { authorization: `Bearer ${s}` } });

describe('프로젝트 그룹 · 상태 · 정산 · 팀 멤버', () => {
  it('그룹 만들기(고른 프로젝트들을 바로 넣기), 목록, 삭제(프로젝트는 남음)', async () => {
    expect((await json('/api/groups', { name: 'x' })).status).toBe(401);
    const s = await login('g-owner@example.com');
    const a = await createProject(s, 'A'), b = await createProject(s, 'B');
    const r = await json('/api/groups', { name: ' 강남점 묶음 ', projectIds: [a.id, b.id] }, s);
    expect(r.status).toBe(201);
    const { group } = await r.json<{ group: { id: string; name: string; role: string; canBilling: boolean } }>();
    expect(group).toMatchObject({ name: '강남점 묶음', role: 'owner', canBilling: true });
    const view = await (await get(`/api/groups/${group.id}`, s)).json<{ projects: { id: string }[] }>();
    expect(view.projects.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect((await json('/api/groups', { name: ' ' }, s)).status).toBe(400);
    expect((await del(`/api/groups/${group.id}`, s)).status).toBe(204);
    const mine = (await (await get('/api/projects', s)).json<{ projects: { id: string; groupId: string | null }[] }>()).projects;
    expect(mine.every((p) => p.groupId === null)).toBe(true);
  });

  it('계약 금액 = 앱이 저장한 견적 합계(자동), 직접 입력하면 그 값, null 로 자동 복구. 상태·받은 금액은 소유자만', async () => {
    const s = await login('g2@example.com');
    const other = await login('g2-other@example.com');
    const p = await createProject(s, '카페');
    expect((await json(`/api/projects/${p.id}`, { status: 'ongoing' }, other, 'PATCH')).status).toBe(403);
    // 정지(paused) 상태 + 상태가 된 시각 (2026-10-21 홈 "지난 프로젝트" 접기): 상태가 바뀔 때만 statusAt 이 찍힌다
    const t0 = Date.now();
    const pz = await (await json(`/api/projects/${p.id}`, { status: 'paused' }, s, 'PATCH')).json<{ project: { status: string; statusAt?: number } }>();
    expect(pz.project.status).toBe('paused');
    expect(pz.project.statusAt).toBeGreaterThanOrEqual(t0);
    const same = await (await json(`/api/projects/${p.id}`, { status: 'paused', paidAmount: 1 }, s, 'PATCH')).json<{ project: { statusAt?: number } }>();
    expect(same.project.statusAt).toBe(pz.project.statusAt); // 같은 상태면 그대로
    expect((await json(`/api/projects/${p.id}`, { status: 'stopped' }, s, 'PATCH')).status).toBe(400);
    let r = await json(`/api/projects/${p.id}`, { quoteTotal: 1_500_000, status: 'ongoing', paidAmount: 500_000 }, s, 'PATCH');
    expect(r.status).toBe(200);
    let { project } = await r.json<{ project: Record<string, unknown> }>();
    expect(project).toMatchObject({ status: 'ongoing', quoteTotal: 1_500_000, contractAmount: 1_500_000, contractAuto: true, paidAmount: 500_000 });
    r = await json(`/api/projects/${p.id}`, { contractAmount: 1_200_000 }, s, 'PATCH');
    ({ project } = await r.json<{ project: Record<string, unknown> }>());
    expect(project).toMatchObject({ contractAmount: 1_200_000, contractAuto: false, quoteTotal: 1_500_000 });
    r = await json(`/api/projects/${p.id}`, { contractAmount: null }, s, 'PATCH');
    ({ project } = await r.json<{ project: Record<string, unknown> }>());
    expect(project).toMatchObject({ contractAmount: 1_500_000, contractAuto: true });
    expect((await json(`/api/projects/${p.id}`, { status: 'weird' }, s, 'PATCH')).status).toBe(400);
    expect((await json(`/api/projects/${p.id}`, { paidAmount: -1 }, s, 'PATCH')).status).toBe(400);
    const og = (await (await json('/api/groups', { name: 'OG' }, other)).json<{ group: { id: string } }>()).group;
    expect((await json(`/api/projects/${p.id}`, { groupId: og.id }, s, 'PATCH')).status).toBe(403);
  });

  it('팀 멤버(설정): 오너가 이메일로 추가 → 오너의 모든 그룹이 보이고, 정산 금액은 허용한 멤버만', async () => {
    const s = await login('g3@example.com');
    const mSession = await login('g3-member@example.com');
    const stranger = await login('g3-stranger@example.com');
    const p = await createProject(s, '본점');
    const g = (await (await json('/api/groups', { name: 'G3', projectIds: [p.id] }, s)).json<{ group: { id: string } }>()).group;
    await json(`/api/projects/${p.id}`, { quoteTotal: 2_000_000, status: 'done', paidAmount: 2_000_000 }, s, 'PATCH');
    expect((await get(`/api/groups/${g.id}`, mSession)).status).toBe(403);
    expect((await json('/api/me/team', { email: 'nobody@example.com' }, s)).status).toBe(404);
    expect((await json('/api/me/team', { email: 'g3@example.com' }, s)).status).toBe(400); // 자기 자신
    expect((await json('/api/me/team', { email: 'G3-Member@example.com', canBilling: false }, s)).status).toBe(201);
    expect((await (await get('/api/me/team', s)).json<{ members: { email: string; canBilling: boolean }[] }>()).members).toEqual([expect.objectContaining({ email: 'g3-member@example.com', canBilling: false })]);
    const list = (await (await get('/api/groups', mSession)).json<{ groups: { id: string; role: string; canBilling: boolean }[] }>()).groups;
    expect(list).toEqual([expect.objectContaining({ id: g.id, role: 'member', canBilling: false })]);
    let view = await (await get(`/api/groups/${g.id}`, mSession)).json<{ projects: Record<string, unknown>[] }>();
    expect(view.projects[0]).toMatchObject({ id: p.id, status: 'done' });
    expect(view.projects[0].contractAmount).toBeUndefined();
    expect(view.projects[0].quoteTotal).toBeUndefined();
    const me = await (await get('/api/me', mSession)).json<{ account: { id: string } }>();
    expect((await json(`/api/me/team/${me.account.id}`, { canBilling: true }, stranger, 'PATCH')).status).toBe(404);
    expect((await json(`/api/me/team/${me.account.id}`, { canBilling: true }, s, 'PATCH')).status).toBe(200);
    view = await (await get(`/api/groups/${g.id}`, mSession)).json<{ projects: Record<string, unknown>[] }>();
    expect(view.projects[0]).toMatchObject({ contractAmount: 2_000_000, paidAmount: 2_000_000 });
    expect((await del(`/api/me/team/${me.account.id}`, s)).status).toBe(204);
    expect((await get(`/api/groups/${g.id}`, mSession)).status).toBe(403);
    expect((await get('/api/groups', stranger)).status).toBe(200);
  });
});
