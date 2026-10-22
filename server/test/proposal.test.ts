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
