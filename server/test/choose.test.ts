// 가게 사장이 제안 목록에서 간판집을 확정 (2026-10-22 사용자: "소비자가 간판집을 제안 리스트에서 확정을 선택하면 견적요청에서 사라지고 탈락한 업체의 복제된 프로젝트에 배지를 달아
// 다른 곳에서 진행하게 된것을 알린다. 다만 변심으로 다시 시작할 수 있음으로 정지 처리 안내한다.")
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { get, json, login } from './helpers';

const u = () => crypto.randomUUID().slice(0, 6);
const randPhone = () => `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
async function shopWithProposal(id: string) {
  const s = await login(`ch-s-${u()}@example.com`);
  await json('/api/me/request-settings', { receive: true, regions: ['경기 광주시'] }, s, 'PUT');
  const { project } = await (await json(`/api/requests/${id}/respond`, {}, s)).json<{ project: { id: string } }>();
  await json(`/api/projects/${project.id}`, { status: 'ongoing' }, s, 'PATCH');
  await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, s);
  return { s, project: project.id };
}
const projectOf = async (s: string, id: string) => (await (await get('/api/projects', s)).json<{ projects: { id: string; status: string; lost?: boolean }[] }>()).projects.find((p) => p.id === id)!;

describe('확정', () => {
  it('가게 사장이 제안 하나를 확정하면 요청은 승인, 받은 목록에서 사라지고, 떨어진 간판집 프로젝트는 "다른 업체 선택" + 정지', async () => {
    const cust = await login(`ch-c-${u()}@example.com`);
    const { id, key } = await (await json('/api/requests', { store: '확정 가게', address: '경기도 광주시 경안로 1', phone: randPhone(), general: true }, cust)).json<{ id: string; key: string }>();
    const a = await shopWithProposal(id), b = await shopWithProposal(id);
    const view = await (await get(`/api/requests/${id}`, cust)).json<{ responses: { projectId: string; shop: string }[] }>();
    expect(view.responses.map((r) => r.projectId).sort()).toEqual([a.project, b.project].sort());
    expect((await json(`/api/requests/${id}/choose`, { projectId: a.project }, b.s)).status).toBe(403); // 간판집은 못 고른다
    expect((await json(`/api/requests/${id}/choose`, { projectId: 'nope' }, cust)).status).toBe(400);
    const r = await json(`/api/requests/${id}/choose?key=${key}`, { projectId: a.project }, '');
    expect(r.status).toBe(200);
    const v = await (await get(`/api/requests/${id}`, cust)).json<{ request: { status: string; chosenProject: string } }>();
    expect(v.request).toMatchObject({ status: 'approved', chosenProject: a.project });
    // 받은 목록에서 사라진다 (둘 다)
    for (const s of [a.s, b.s]) expect((await (await get('/api/requests', s)).json<{ requests: { id: string }[] }>()).requests.map((x) => x.id)).not.toContain(id);
    // 떨어진 간판집: 다른 업체 선택 + 정지. 고른 간판집은 그대로
    expect(await projectOf(b.s, b.project)).toMatchObject({ lost: true, status: 'paused' });
    expect(await projectOf(a.s, a.project)).toMatchObject({ lost: false, status: 'ongoing' });
    expect((await (await get(`/api/projects/${b.project}/access`, b.s)).json<{ lost?: boolean }>()).lost).toBe(true);
    // 변심: 다른 간판집 제안을 승인하면(제안 페이지) 바뀐다 — 앞 간판집이 떨어지고 새 간판집은 다시 살아난다
    const { markApproved } = await import('../src/requests');
    await markApproved(env as unknown as Env, b.project);
    expect(await projectOf(b.s, b.project)).toMatchObject({ lost: false });
    expect(await projectOf(a.s, a.project)).toMatchObject({ lost: true, status: 'paused' });
  });
});
