import { expect, test } from '@playwright/test';
import { apiCreateInvite, openInvited, openOwnedProject, openObjectSettings } from './helpers';

/** 합성 건물 사진 + 원근(치수 입력 사인물) + 전광 채널 "간판다" */
async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const r = await openOwnedProject(page, request, '한울상사');
  const dataUrl = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { makeSamplePhoto } = await import(/* @vite-ignore */ path);
    return makeSamplePhoto().toDataURL('image/png') as string;
  });
  await page.getByTestId('photo-input').setInputFiles({ name: '매장.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByTestId('photo-zone').waitFor();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  const signId = await page.evaluate(async () => {
    const path = '/src/lib/sim/sample.ts';
    const { SAMPLE } = await import(/* @vite-ignore */ path);
    const hp = '/src/lib/core/homography.ts';
    const { applyHomography, solveHomography } = await import(/* @vite-ignore */ hp);
    const H = solveHomography([[0, SAMPLE.wallH], [SAMPLE.wallW, SAMPLE.wallH], [SAMPLE.wallW, 0], [0, 0]], SAMPLE.corners);
    const rect = (x: number, y: number, w: number, h: number) => [[x, y + h], [x + w, y + h], [x + w, y], [x, y]].map((p) => applyHomography(H, p as [number, number]));
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    return app.project.addObject({ photoId, name: '메인 간판', shape: 'rect', quad: rect(0, 3700, 9000, 1000), sheetIds: [], widthMm: 9000, heightMm: 1000, productId: 'ch-front', text: '간판다', options: { chType: '캡' } });
  });
  return { ...r, signId };
}

test('제안 보내기: [링크 발급](실사 이미지 안 만듦, 2026-10-24) → 고객이 휴대폰 페이지에서 보고 질문·승인 → 제작자에게 승인 표시, 내용이 바뀌면 재승인 필요', async ({ page, request, browser }) => {
  const { session, projectId } = await setup(page, request);
  await page.getByTestId('proposal-button').click();
  const dlg = page.getByTestId('proposal-dialog');
  await expect(dlg.getByTestId('proposal-summary')).toContainText('사인물 1개');
  await dlg.getByTestId('proposal-note').fill('야간 모습도 확인해 보세요');
  await expect(dlg.getByTestId('proposal-build')).toHaveText('링크 발급'); // 2026-10-24 "실사이미지 만들필요가 없고 링크발급으로"
  await dlg.getByTestId('proposal-build').click();
  await expect(dlg.getByTestId('proposal-link')).toHaveValue(/\/p\/.+\/.+/, { timeout: 5_000 }); // 실사 합성이 없어 바로
  const link = await dlg.getByTestId('proposal-link').inputValue();
  const [, room, token] = link.match(/\/p\/([^/]+)\/([^/]+)$/)!;
  expect(room).toBe(projectId);
  await dlg.getByTestId('close-proposal').click();
  await expect(page.getByTestId('approval-status')).toHaveCount(0);

  // 고객: 링크 → 제안 페이지 (서버 랜딩이 앱의 ?proposal=1 로 보냄)
  const guest = await openInvited(browser, `http://localhost:5199/?room=${room}&invite=${token}&proposal=1`, '홍길동');
  const pg = guest.getByTestId('proposal-page');
  await expect(pg).toContainText('한울상사');
  // 견적 제안 화면은 파랑 (2026-10-22 "견적제안은 블루컬러로")
  expect(await guest.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#3b82f6');
  await expect(pg.getByTestId('proposal-note-view')).toContainText('야간 모습');
  // 실사 이미지 대신 가게 사진 위에 사인물 외곽선·이름
  await expect(pg.getByTestId('proposal-render')).toHaveCount(0);
  await expect(pg.getByTestId('proposal-photo')).toHaveCount(1);
  await expect(pg.getByTestId('proposal-photo-sign')).toHaveCount(1);
  await expect(pg.getByTestId('proposal-photo')).toContainText('메인 간판');
  await expect(pg.getByTestId('proposal-photo').locator('image')).toHaveAttribute('href', /blob:|http/, { timeout: 15_000 });
  await expect(pg.getByTestId('proposal-sign')).toHaveCount(1);
  await expect(pg.getByTestId('proposal-sign')).toContainText('채널 간판 (전광)');
  await expect(pg.getByTestId('proposal-sign')).toContainText('9,000 × 1,000');
  await expect(pg.getByTestId('proposal-total')).toContainText('원');
  await expect(guest.getByTestId('top-nav')).toBeHidden(); // 고객 페이지에는 작업용 상단 바가 없다
  await expect(pg.getByTestId('proposal-branding')).toContainText('간판다로 만든 제안'); // 무료 요금제 (2026-10-17)

  // 질문
  await pg.getByTestId('proposal-ask').click();
  await guest.getByTestId('chat-input').fill('밤에 얼마나 밝나요?');
  await guest.getByTestId('chat-send').click();
  await expect(page.getByTestId('toast')).toContainText('밤에 얼마나 밝나요?');

  // 승인
  await expect(pg.getByTestId('ganpanda-promise')).toContainText('기록이 증거가 됩니다'); // 간판다로 진행하면 (2026-10-24)
  await pg.getByTestId('proposal-approve-button').click();
  await pg.getByTestId('proposal-approver').fill('홍길동');
  await pg.getByTestId('proposal-approve-confirm').click();
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'approved');
  await expect(pg.getByTestId('proposal-approve')).toContainText('홍길동');
  await expect(page.getByTestId('approval-status')).toHaveAttribute('data-status', 'approved');
  await expect(page.getByTestId('approval-status')).toContainText('홍길동');
  await expect(page.getByTestId('toast').filter({ hasText: '진행에 동의' })).toHaveCount(1); // 2026-10-22 진행 동의 → 제작

  // 제작자가 치수를 바꾸면 → 사장 화면은 변경됨 · "발행 뒤 바뀜", 고객에게는 아직 동의한 발행본 그대로 (2026-10-26 발행 견적 박제)
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), (await page.evaluate(() => (window as unknown as { __ganpanda: { signs: { id: string }[] } }).__ganpanda.signs[0].id)));
  await openObjectSettings(page);
  await page.getByTestId('height-mm').fill('1200');
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('approval-status')).toHaveAttribute('data-status', 'changed');
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('issue-banner')).toHaveAttribute('data-changed', 'true');
  await page.getByTestId('issue-diff-toggle').click();
  await expect(page.getByTestId('quote-change-item')).toContainText('1000');
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'approved');
  await expect(pg.getByTestId('proposal-sign')).toContainText('9,000 × 1,000'); // 고객에게는 발행본
  const contractTotal = await pg.getByTestId('proposal-total').textContent();

  // 변경 견적 발행 → 고객: 계약 견적과 비교해 동의·거절
  await page.getByTestId('issue-reissue').click();
  const dlg2 = page.getByTestId('proposal-dialog');
  await expect(dlg2.getByTestId('proposal-change-preview')).toBeVisible(); // 고객에게 이렇게 보입니다
  await expect(dlg2.getByTestId('proposal-build')).toHaveText('변경 견적 발행 (#2)');
  await dlg2.getByTestId('proposal-build').click();
  await expect(dlg2.getByTestId('proposal-link')).toHaveValue(/\/p\//);
  await dlg2.getByTestId('close-proposal').click();
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'pending-change');
  await expect(pg.getByTestId('proposal-change')).toContainText('변경 견적 #2');
  await expect(pg.getByTestId('quote-change-item')).toContainText('1000');
  await expect(pg.getByTestId('quote-change-item')).toContainText('1200');
  await expect(pg.getByTestId('proposal-sign')).toContainText('9,000 × 1,200');
  // ① 사진 위 변경 표시 · ③ 금액 흐름 (2026-10-26) — 손해 가능이 아니고 하나뿐이면 바로 동의할 수 있다(⑤ 확인 없음)
  await expect(pg.getByTestId('change-mark').and(pg.locator('[data-change="changed"]'))).toHaveCount(1);
  await expect(pg.getByTestId('change-legend')).toContainText('바뀜');
  const steps = pg.getByTestId('quote-flow').getByTestId('quote-flow-step');
  await expect(steps.first()).toHaveAttribute('data-key', 'before'); // 계약 → (바뀐 금액이 있으면 그 단계) → 변경
  await expect(steps.last()).toHaveAttribute('data-key', 'after');
  await expect(pg.getByTestId('quote-change-confirm')).toHaveCount(0);
  await expect(pg.getByTestId('proposal-change-accept')).toBeEnabled();
  // 거절 → 계약 견적대로
  await pg.getByTestId('proposal-change-reject').click();
  await pg.getByTestId('proposal-approver').fill('홍길동');
  await pg.getByTestId('proposal-change-confirm').click();
  await expect(pg.getByTestId('proposal-rejected')).toContainText('계약 견적 #1');
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'approved');
  await expect(pg.getByTestId('proposal-sign')).toContainText('9,000 × 1,000');
  await expect(pg.getByTestId('proposal-total')).toHaveText(contractTotal!);
  await expect(page.getByTestId('toast').filter({ hasText: '거절' })).toHaveCount(1);
  // 기록: 동의 1 + 거절 1, 동의한 사본은 처음 치수
  const approvals = await page.evaluate(() => (window as unknown as { __ganpanda: { settings: { approvals: { by: string; decision?: string; snapshot: { items: { size: { h: number } }[] } }[] } } }).__ganpanda.settings.approvals);
  expect(approvals.map((a) => a.decision ?? 'agreed')).toEqual(['agreed', 'rejected']);
  expect(approvals[0].snapshot.items[0].size.h).toBe(1000);
  await guest.ctx.close();
  void session;
});

test('제안을 만들 수 없을 때 이유를 보여 준다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.getByTestId('proposal-button').click();
  const dlg = page.getByTestId('proposal-dialog');
  await expect(dlg.getByTestId('proposal-problems')).toContainText('사진이 없습니다');
  await expect(dlg.getByTestId('proposal-build')).toBeDisabled();
  await dlg.getByTestId('close-proposal').click();
});

test('서버 제안 링크 랜딩은 OG 메타를 주고 앱의 제안 페이지로 보낸다', async ({ page, request }) => {
  const { session, projectId } = await openOwnedProject(page, request, '한울상사');
  const invite = await apiCreateInvite(request, session, projectId, 'viewer');
  const token = new URL(invite).searchParams.get('invite')!;
  const r = await request.get(`http://localhost:8787/p/${projectId}/${token}`);
  expect(r.status()).toBe(200);
  const html = await r.text();
  expect(html).toContain('og:title');
  expect(html).toContain('한울상사');
  expect(html).toContain(`&proposal=1`);
});

test('무료 요금제: 이번 달 제안 링크 3건을 넘으면 안내 (2026-10-17 요금제)', async ({ page, request }) => {
  const { session, projectId } = await setup(page, request);
  for (let i = 0; i < 3; i++) {
    const r = await request.post(`http://localhost:8787/api/projects/${projectId}/invites`, { data: { role: 'viewer', kind: 'proposal' }, headers: { authorization: `Bearer ${session}` } });
    expect(r.status()).toBe(201);
  }
  await page.getByTestId('proposal-button').click();
  const dlg = page.getByTestId('proposal-dialog');
  await dlg.getByTestId('proposal-build').click();
  await expect(dlg.getByTestId('proposal-error')).toContainText('한 달 3건', { timeout: 30_000 });
  await expect(dlg.getByTestId('proposal-link')).toHaveCount(0);
});

// 2026-10-26 고객 안전장치: "새로운 제안과 변경이 고객에게 손해가 나거나 … 시스탬적으로 잡아내서 고객에게 안전장치"
test('사양은 그대로인데 금액만 올린 변경 견적은 고객에게 위험으로 표시, 동의하면 새 계약 · 발행본은 단가가 바뀌어도 그대로', async ({ page, request, browser }) => {
  await setup(page, request);
  const issue = async () => {
    await page.getByTestId('proposal-button').click();
    const d = page.getByTestId('proposal-dialog');
    await d.getByTestId('proposal-build').click();
    await expect(d.getByTestId('proposal-link')).toHaveValue(/\/p\//);
    const link = await d.getByTestId('proposal-link').inputValue();
    await d.getByTestId('close-proposal').click();
    return link;
  };
  const link = await issue();
  const [, room, token] = link.match(/\/p\/([^/]+)\/([^/]+)$/)!;
  const guest = await openInvited(browser, `http://localhost:5199/?room=${room}&invite=${token}&proposal=1`, '김사장');
  const pg = guest.getByTestId('proposal-page');
  const first = await pg.getByTestId('proposal-total').textContent();
  await pg.getByTestId('proposal-approve-button').click();
  await pg.getByTestId('proposal-approver').fill('김사장');
  await pg.getByTestId('proposal-approve-confirm').click();
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'approved');

  // 사장이 단가만 올린다 (사양 그대로) → 고객에게는 아직 계약 금액
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { quote: { lines: { key: string; unitPrice?: number }[] }; setLineUnit(k: string, v: number): void } }).__ganpanda; const l = a.quote.lines.find((x) => x.unitPrice !== undefined)!; a.setLineUnit(l.key, l.unitPrice! * 2); });
  await expect(pg.getByTestId('proposal-total')).toHaveText(first!);
  await issue();
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'pending-change');
  await expect(pg.getByTestId('quote-risk').and(pg.locator('[data-code="price-up-same-spec"]'))).toHaveAttribute('data-level', 'danger');
  await expect(pg.getByTestId('quote-change-risks')).toContainText('사양은 그대로인데 금액이');
  // ① 사진 위 ⚠ — 누르면 이유
  await pg.getByTestId('change-risk-marker').click();
  await expect(pg.getByTestId('change-risk-note')).toContainText('사양은 그대로인데 금액이');
  // ③ 금액 흐름: 계약 → 바뀜(+) → 변경
  await expect(pg.getByTestId('quote-flow').locator('[data-key="changed"]')).toContainText('+');
  // ⑤ 위험이 있으면 바뀐 사인물마다 확인해야 동의가 열린다
  await expect(pg.getByTestId('proposal-change-accept')).toBeDisabled();
  await expect(pg.getByTestId('proposal-change-accept')).toContainText('0/1 확인');
  await pg.getByTestId('quote-change-confirm').check();
  await expect(pg.getByTestId('proposal-change-accept')).toBeEnabled();
  // 동의 → 새 계약 (#2)
  await pg.getByTestId('proposal-change-accept').click();
  await pg.getByTestId('proposal-approver').fill('김사장');
  await pg.getByTestId('proposal-change-confirm').click();
  await expect(pg.getByTestId('proposal-approve')).toHaveAttribute('data-status', 'approved');
  await expect(pg.getByTestId('proposal-issue-no')).toContainText('견적 #2');
  const agreed = await pg.getByTestId('proposal-total').textContent();
  expect(agreed).not.toBe(first);
  // 발행 뒤 내 단가표를 바꿔도 고객이 보는 발행본은 그대로 (박제)
  await page.evaluate(() => { const a = (window as unknown as { __ganpanda: { quote: { lines: { key: string; unitPrice?: number }[] }; setLineUnit(k: string, v: number): void } }).__ganpanda; const l = a.quote.lines.find((x) => x.unitPrice !== undefined)!; a.setLineUnit(l.key, 1000); });
  await expect(pg.getByTestId('proposal-total')).toHaveText(agreed!);
  await guest.ctx.close();
});
