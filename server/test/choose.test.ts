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
  const inv = await (await json(`/api/projects/${project.id}/invites`, { role: 'viewer', kind: 'proposal' }, s)).json<{ token: string }>();
  return { s, project: project.id, token: inv.token };
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
    // 2026-10-28 사용자: "이미 견적을 결정했다면 다른 업체의 견적을 보여주지 않는다. 다른 방향으로는 견적이 선택되면 다른 업체의 견적을 바꾸지 못한다.
    // (이전에 견적을 바꿀수 있다고 내가 했어 취소)" — 변심(다른 곳으로 바꾸기)은 대체됨
    // ① 고객에게는 고른 제안만
    const after = await (await get(`/api/requests/${id}`, cust)).json<{ responses: { projectId: string }[] }>();
    expect(after.responses.map((x) => x.projectId)).toEqual([a.project]);
    // ② 다른 곳으로 바꿀 수 없다 — 확정·제안 승인 모두
    const again = await json(`/api/requests/${id}/choose`, { projectId: b.project }, cust);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: 'already_chosen' });
    const { markApproved } = await import('../src/requests');
    await markApproved(env as unknown as Env, b.project);
    expect(await projectOf(b.s, b.project)).toMatchObject({ lost: true });
    expect(await projectOf(a.s, a.project)).toMatchObject({ lost: false });
    // ③ 떨어진 간판집은 견적을 바꾸지 못한다 — 새 제안 링크 없음
    const inv = await json(`/api/projects/${b.project}/invites`, { role: 'viewer', kind: 'proposal' }, b.s);
    expect(inv.status).toBe(403);
    expect(await inv.json()).toMatchObject({ error: 'lost' });
    // ④ 떨어진 간판집의 예전 제안 링크로는 견적을 볼 수 없다 (410), 고른 간판집 링크는 그대로
    expect((await get(`/api/projects/${b.project}/access?invite=${b.token}`, '')).status).toBe(410);
    expect((await get(`/api/projects/${a.project}/access?invite=${a.token}`, '')).status).toBe(200);
    // 떨어진 간판집 본인은 자기 프로젝트를 그대로 연다 (보관용)
    expect((await get(`/api/projects/${b.project}/access`, b.s)).status).toBe(200);
  });
});
