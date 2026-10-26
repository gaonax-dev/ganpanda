// 신고·차단 (2026-10-26 사용자: "신고·차단 기능 진행해줘" — 앱스토어 1.2 사용자 생성 콘텐츠: 신고·차단·운영자 처리·연락처)
import { describe, expect, it } from 'vitest';
import { TestClient, until } from './client';
import { api, createInvite, createProject, get, json, login } from './helpers';

const mail = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}@example.com`;
const idOf = async (s: string) => (await (await get('/api/me', s)).json<{ account: { id: string } }>()).account.id;

describe('신고', () => {
  it('로그인한 사람·초대 링크 손님 모두 메시지를 신고할 수 있고, 서버가 메시지 내용을 증거로 남긴다 — 운영자는 목록에서 보고 [숨김]하면 메시지가 지워진다', async () => {
    const owner = await login(mail('own')), op = await login('op@example.com');
    const project = await createProject(owner, '신고 매장');
    const o = await TestClient.connect(project.id, undefined, { session: owner });
    o.doc.getArray('messages').push([{ id: 'm-bad', objectId: 'talk:team', author: '나쁜말', authorId: 'g:abc', text: '광고 링크 클릭하세요', kind: 'chat', ts: Date.now() }]);
    await new Promise((r) => setTimeout(r, 300));
    // 손님(초대 링크)이 신고
    const inv = await createInvite(owner, project.id, 'viewer');
    const r = await json(`/api/reports?invite=${inv.token}`, { projectId: project.id, messageId: 'm-bad', targetId: 'g:abc', targetName: '나쁜말', reason: 'spam', detail: '광고입니다' });
    expect(r.status).toBe(201);
    // 자격 없으면 거절, 이유가 이상하면 400
    expect((await json('/api/reports', { projectId: project.id, messageId: 'm-bad', reason: 'spam' })).status).toBe(401);
    expect((await json(`/api/reports?invite=${inv.token}`, { projectId: project.id, messageId: 'm-bad', reason: 'xx' })).status).toBe(400);
    // 운영자 목록: 메시지 내용이 증거로
    const list = (await (await get('/api/operator/content-reports', op)).json<{ reports: { id: string; reason: string; excerpt: string; targetName: string; status: string }[] }>()).reports;
    const rep = list.find((x) => x.excerpt === '나쁜말: 광고 링크 클릭하세요')!; // 작성자: 글
    expect(rep).toMatchObject({ reason: 'spam', targetName: '나쁜말', status: 'open' });
    expect((await get('/api/operator/content-reports', owner)).status).toBe(403); // 운영자만
    // 숨김 → 메시지 삭제, 처리됨
    expect((await json(`/api/operator/content-reports/${rep.id}`, { action: 'hide' }, op)).status).toBe(200);
    await until(() => o.doc.getArray('messages').length === 0);
    const after = (await (await get('/api/operator/content-reports', op)).json<{ reports: { id: string; status: string; action?: string }[] }>()).reports.find((x) => x.id === rep.id)!;
    expect(after).toMatchObject({ status: 'resolved', action: 'hide' });
    o.close();
  });

  it('사용자 신고(메시지 없이)는 로그인 필요', async () => {
    const me = await login(mail('rep')), other = await login(mail('oth'));
    const r = await json('/api/reports', { targetId: await idOf(other), targetName: '상대', reason: 'abuse', detail: '' }, me);
    expect(r.status).toBe(201);
  });
});

describe('차단', () => {
  it('내 차단 목록: 추가·조회·해제 (계정별)', async () => {
    const me = await login(mail('blk')), other = await login(mail('bld'));
    const oid = await idOf(other);
    expect((await json('/api/me/blocks', { id: oid, name: '상대 이름' }, me)).status).toBe(201);
    expect((await json('/api/me/blocks', { id: 'g:guest-1', name: '손님' }, me)).status).toBe(201);
    const list = (await (await get('/api/me/blocks', me)).json<{ blocks: { id: string; name: string }[] }>()).blocks;
    expect(list.map((b) => b.id).sort()).toEqual([oid, 'g:guest-1'].sort());
    expect((await api(`/api/me/blocks/${encodeURIComponent(oid)}`, { method: 'DELETE', headers: { authorization: `Bearer ${me}` } })).status).toBe(200);
    expect((await (await get('/api/me/blocks', me)).json<{ blocks: { id: string }[] }>()).blocks.map((b) => b.id)).toEqual(['g:guest-1']);
    expect((await get('/api/me/blocks')).status).toBe(401);
    expect((await json('/api/me/blocks', { id: await idOf(me) }, me)).status).toBe(400); // 나 자신은 안 됨
  });
});
