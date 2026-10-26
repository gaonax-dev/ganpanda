// 운영자 신고 처리 화면 (2026-10-26 사용자: "운영자 신고 처리 화면 만들어줘") — /ops: 대화·사용자 신고(숨김=메시지 삭제·기각), 간판다 밖 거래 신고(위약금·기각), 요청 받기 정지 풀기
import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiLogin, openOwnedProject, uploadPhoto, SERVER } from './helpers';

type G = { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; openChat(id: string): void } };

test('운영자: 계정 메뉴 [신고 처리 n] → /ops — 신고 카드(이유·메시지 글·신고자·경과 시간), [메시지 숨김]하면 문서에서 지워지고 처리됨으로, 운영자가 아니면 들어올 수 없다', async ({ page, request, browser }) => {
  const tag = Math.random().toString(36).slice(2, 8); // 지난 실행의 신고와 섞이지 않게
  const { session, projectId } = await openOwnedProject(page, request, '운영 매장');
  await uploadPhoto(page);
  const signId = await page.evaluate(() => { const g = (window as unknown as G).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [600, 100], [600, 300], [100, 300]], sheetIds: [] }); });
  await page.evaluate((id) => (window as unknown as G).__ganpanda.openChat(id), signId);
  await page.getByTestId('chat-input').fill('여기로 연락주세요 광고광고');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-bubble')).toHaveCount(1);
  // 고객이 신고
  const inv = new URL(await apiCreateInvite(request, session, projectId, 'viewer')).searchParams.get('invite')!;
  const msgId = await page.evaluate(() => (window as unknown as { __ganpanda: { project: { messagesOf(id: string): { id: string }[] } }; }).__ganpanda.project.messagesOf((window as unknown as { __ganpanda: { selectedId: string } }).__ganpanda.selectedId)[0].id);
  const rep = await request.post(`${SERVER}/api/reports?invite=${inv}`, { data: { projectId, messageId: msgId, targetName: '제작자', reason: 'spam', detail: `e2e 광고 신고 ${tag}` } });
  expect(rep.status()).toBe(201);

  // 운영자가 아닌 사람
  await page.goto('/ops');
  await expect(page.getByTestId('ops-forbidden')).toBeVisible();

  // 운영자
  const op = await apiLogin(request, 'op@example.com');
  const opPage = await browser.newPage();
  await opPage.goto('/');
  await opPage.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, op);
  await opPage.reload();
  await opPage.getByTestId('account-menu').click();
  await expect(opPage.getByTestId('account-ops')).toContainText('신고 처리');
  await opPage.getByTestId('account-ops').click();
  await expect(opPage).toHaveURL(/\/ops/);
  const card = opPage.getByTestId('ops-report').filter({ hasText: `e2e 광고 신고 ${tag}` });
  await expect(card).toHaveAttribute('data-status', 'open');
  await expect(card).toContainText('스팸·광고');
  await expect(card).toContainText('여기로 연락주세요 광고광고'); // 서버가 남긴 메시지 글
  await expect(card.getByTestId('ops-age')).toBeVisible();
  // 숨김 → 확인 → 처리됨, 문서에서 지워짐
  opPage.once('dialog', (d) => void d.accept());
  await card.getByTestId('ops-hide').click();
  await expect(card).toHaveAttribute('data-status', 'resolved');
  await expect(card).toContainText('숨김');
  // 문서에서 지워짐 — 사장이 프로젝트를 다시 열면 말풍선이 없다
  await page.goto(`/?room=${projectId}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.evaluate((id) => (window as unknown as G).__ganpanda.openChat(id), signId);
  await expect(page.getByTestId('object-chat')).toBeVisible();
  await expect(page.getByTestId('chat-bubble')).toHaveCount(0);
  // 처리 대기 걸러 보기
  await opPage.getByTestId('ops-filter-open').click();
  await expect(opPage.getByTestId('ops-report').filter({ hasText: `e2e 광고 신고 ${tag}` })).toHaveCount(0);
  await opPage.close();
});
