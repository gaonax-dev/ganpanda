import { beforeEach, describe, expect, it } from 'vitest';
import { TestClient, until } from './client';
import { api, createInvite, createProject, get, json, login } from './helpers';

let owner = '';
let project = { id: '', name: '' };
beforeEach(async () => {
  owner = await login(`own-${crypto.randomUUID().slice(0, 8)}@example.com`);
  project = await createProject(owner, '한울상사');
  TestClient.defaultAuth = {};
});

const approval = (hash: string, by = '홍길동') => ({ by, hash, snapshot: { items: [{ id: 'a', name: '메인', category: '간판', type: '후렉스 간판', sheets: [], options: ['양면'], size: { w: 3000, h: 600, estimated: false }, amount: 500000 }], subtotal: 500000, vat: 50000, total: 550000, vatIncluded: false } });

describe('제안 승인 (viewer 가 문서 편집 권한 없이 승인 기록)', () => {
  it('viewer 초대 토큰으로 승인하면 settings.approvals 에 쌓이고, 승인 메시지가 대화에 남는다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const r = await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, approval('abc12345'));
    expect(r.status).toBe(201);
    const body = await r.json<{ approval: { id: string; at: number; by: string; hash: string } }>();
    expect(body.approval.by).toBe('홍길동');
    expect(body.approval.hash).toBe('abc12345');
    await until(() => (o.doc.getMap('settings').get('approvals') as unknown[] | undefined)?.length === 1);
    const stored = (o.doc.getMap('settings').get('approvals') as { id: string; by: string; snapshot: { total: number } }[])[0];
    expect(stored.id).toBe(body.approval.id);
    expect(stored.snapshot.total).toBe(550000);
    await until(() => (o.doc.getArray('messages').toArray() as { kind: string }[]).some((m) => m.kind === 'approval'));
    const msg = (o.doc.getArray('messages').toArray() as { kind: string; author: string; objectId: string; text: string }[]).find((m) => m.kind === 'approval')!;
    expect(msg.author).toBe('홍길동');
    expect(msg.objectId).toBe('project');
    expect(msg.text).toContain('진행에 동의');
    o.close();
  });

  it('이름·해시가 없거나 자격이 없으면 거절', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    expect((await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, { by: '', hash: 'x', snapshot: {} })).status).toBe(400);
    expect((await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, { by: '홍길동', snapshot: {} })).status).toBe(400);
    expect((await json(`/api/rooms/${project.id}/approvals`, approval('x'))).status).toBe(401);
    expect((await api(`/api/rooms/${project.id}/approvals?invite=${inv.token}`)).status).toBe(405);
  });

  it('여러 번 승인하면 모두 남는다 (버전)', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, approval('h1'));
    await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, approval('h2', '김사장'));
    await until(() => (o.doc.getMap('settings').get('approvals') as unknown[] | undefined)?.length === 2);
    const list = o.doc.getMap('settings').get('approvals') as { hash: string; by: string }[];
    expect(list.map((a) => a.hash)).toEqual(['h1', 'h2']);
    o.close();
  });
});

describe('제안 링크 (카카오톡 미리보기용 OG 페이지)', () => {
  it('/p/:project/:invite 는 프로젝트 이름·미리보기 이미지 메타와 앱으로 가는 링크를 담은 HTML', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const r = await api(`/p/${project.id}/${inv.token}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('og:title');
    expect(html).toContain('한울상사');
    expect(html).toContain(`/p/${project.id}/${inv.token}/image.png`);
    expect(html).toContain(`/?room=${project.id}&invite=${inv.token}&proposal=1`);
  });

  it('토큰이 틀리면 404, 제안 이미지가 없으면 image.png 는 404, 있으면 그 에셋을 준다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    expect((await api(`/p/${project.id}/not-a-token`)).status).toBe(404);
    expect((await api(`/p/${project.id}/${inv.token}/image.png`)).status).toBe(404);
    // 제안 이미지 에셋 올리고 settings.proposal 에 기록
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const digest = await crypto.subtle.digest('SHA-256', png);
    const id = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
    const up = await api(`/api/assets/${id}?project=${project.id}&session=${owner}`, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } });
    expect([200, 201]).toContain(up.status);
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.getMap('settings').set('proposal', { id: 'p1', createdAt: Date.now(), author: '제작자', hash: 'h', renders: [{ photoId: 'ph', day: id, night: id }] });
    await new Promise((res) => setTimeout(res, 200));
    o.close();
    const img = await api(`/p/${project.id}/${inv.token}/image.png`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect((await img.arrayBuffer()).byteLength).toBe(png.byteLength);
  });
});

describe('진행 동의 → 제작 (2026-10-22 "여기에 진행동의를 누르면 제작을 한다")', () => {
  it('동의는 뺀 사인물(excluded)을 함께 기록하고, 대기 중인 프로젝트를 진행중으로 바꾼다 — 정지·완료는 건드리지 않는다', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const r = await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, { ...approval('h-consent'), excluded: ['sign-b', 7, 'sign-c'] });
    expect(r.status).toBe(201);
    await until(() => (o.doc.getMap('settings').get('approvals') as unknown[] | undefined)?.length === 1);
    const stored = (o.doc.getMap('settings').get('approvals') as { excluded?: string[] }[])[0];
    expect(stored.excluded).toEqual(['sign-b', 'sign-c']); // 문자열만
    await until(() => (o.doc.getArray('messages').toArray() as { kind: string; text: string }[]).some((m) => m.kind === 'approval' && m.text.includes('진행에 동의')));
    const status = async () => (await (await get('/api/projects', owner)).json<{ projects: { id: string; status: string }[] }>()).projects.find((p) => p.id === project.id)!.status;
    expect(await status()).toBe('ongoing');
    await json(`/api/projects/${project.id}`, { status: 'paused' }, owner, 'PATCH');
    await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, approval('h-again'));
    expect(await status()).toBe('paused');
    o.close();
  });
});

// 2026-10-26 발행 견적 박제: 고객의 동의·거절은 문서에 박제된 발행본으로 기록 — 고객 쪽에서 금액을 바꿔 보내도 소용없다
describe('발행본에 대한 동의·거절', () => {
  it('proposalId 가 발행본이면 그 발행본의 해시·사본으로 기록, 거절은 decision rejected 와 "계약 견적대로" 메시지 · 프로젝트 상태는 그대로', async () => {
    const inv = await createInvite(owner, project.id, 'viewer');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    const issued = { id: 'iss1', no: 1, at: 1, by: '사장', hash: 'issued-hash', lines: [], snapshot: { ...approval('x').snapshot, total: 990000 } };
    o.doc.getMap('settings').set('issues', [issued, { ...issued, id: 'iss2', no: 2, hash: 'issued-2', snapshot: { ...issued.snapshot, total: 1_200_000 } }]);
    await new Promise((res) => setTimeout(res, 300)); // 사장의 문서 변경이 서버에 닿을 때까지
    // 고객이 금액을 바꿔 보내도 발행본 값으로
    const forged = { ...approval('forged'), proposalId: 'iss1' };
    forged.snapshot.total = 1;
    const r = await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, forged);
    expect(r.status).toBe(201);
    const a = (await r.json<{ approval: { hash: string; snapshot: { total: number } } }>()).approval;
    expect(a).toMatchObject({ hash: 'issued-hash', snapshot: { total: 990000 } });
    // 변경 견적(#2) 거절
    const rj = await json(`/api/rooms/${project.id}/approvals?invite=${inv.token}`, { ...approval('y'), proposalId: 'iss2', decision: 'rejected' });
    expect(rj.status).toBe(201);
    expect((await rj.json<{ approval: { decision?: string; hash: string } }>()).approval).toMatchObject({ decision: 'rejected', hash: 'issued-2' });
    await until(() => (o.doc.getArray('messages').toArray() as { text: string }[]).some((m) => m.text.includes('거절')));
    const msgs = (o.doc.getArray('messages').toArray() as { text: string }[]).map((m) => m.text);
    expect(msgs.some((t) => t.includes('견적 #1에 진행에 동의'))).toBe(true);
    expect(msgs.some((t) => t.includes('변경 견적 #2을 거절했습니다 — 계약 견적대로 진행'))).toBe(true);
    o.close();
  });
});


// 2026-10-26 "원가는 전체 변경이다": 프로젝트 접근 정보에 소유자 계정의 원가 배수 — 소유자·편집에게만
describe('원가 배수 = 계정 전체 설정', () => {
  it('소유자가 계정 단가표의 배수를 바꾸면 그 프로젝트 접근 정보에 바로, 보기(고객)에게는 없다', async () => {
    const markup = { all: 1.4, groups: { 솔벤: 1.2 }, direct: ['UV'] };
    expect((await json('/api/me/prices', { prices: { version: 1, markup } }, owner, 'PUT')).status).toBeLessThan(300);
    const a = await (await get(`/api/projects/${project.id}/access`, owner)).json<{ costMarkup?: unknown }>();
    expect(a.costMarkup).toEqual(markup);
    const inv = await createInvite(owner, project.id, 'viewer');
    const v = await (await api(`/api/projects/${project.id}/access?invite=${inv.token}`)).json<{ costMarkup?: unknown }>();
    expect(v.costMarkup).toBeUndefined();
  });
});
