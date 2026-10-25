// 앱 안 확인·입력 창 (2026-10-25 사용자: "아이폰에서 사진 삭제가 안된다" — iOS·맥 웹뷰는 confirm()/prompt() 를 지원하지 않아 즉시 취소됐다)
import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test('앱 안: 사진 삭제 확인이 자체 창으로 뜨고, [확인]하면 지워진다 · [취소]하면 그대로 · 이름 바꾸기 입력 창', async ({ page, request }) => {
  await page.addInitScript(() => { (window as unknown as { __GANPANDA_APP__: boolean }).__GANPANDA_APP__ = true; });
  await openOwnedProject(page, request, '앱 확인창');
  await uploadPhoto(page);
  page.on('dialog', () => { throw new Error('앱 안에서는 native 대화 창을 쓰면 안 된다'); });
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('photo-delete').click();
  const dlg = page.getByTestId('ask-dialog');
  await expect(dlg).toHaveAttribute('data-kind', 'confirm');
  await expect(dlg.getByTestId('ask-message')).toContainText('삭제할까요');
  await dlg.getByTestId('ask-cancel').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId('photo-zone')).toHaveCount(1); // 취소 = 그대로
  // 이름 바꾸기 = 입력 창
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('photo-rename').click();
  await expect(dlg).toHaveAttribute('data-kind', 'prompt');
  await dlg.getByTestId('ask-input').fill('정면 사진');
  await dlg.getByTestId('ask-ok').click();
  await expect(page.getByTestId('photo-zone').locator('.name')).toContainText('정면 사진');
  // 삭제 확인
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('photo-delete').click();
  await dlg.getByTestId('ask-ok').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(0);
});

test('브라우저에서는 그대로 native 확인 창', async ({ page, request }) => {
  await openOwnedProject(page, request, '웹 확인창');
  await uploadPhoto(page);
  let seen = '';
  page.once('dialog', (d) => { seen = d.message(); void d.accept(); });
  await page.getByTestId('photo-menu').click();
  await page.getByTestId('photo-delete').click();
  await expect(page.getByTestId('photo-zone')).toHaveCount(0);
  expect(seen).toContain('삭제할까요');
  await expect(page.getByTestId('ask-dialog')).toHaveCount(0);
});
