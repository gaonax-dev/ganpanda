// 휴대폰 조작 안내·터치 영역 (2026-10-24 사용자: "처음 시작할때 화면 이동을 두손가락 이동, 핀치줌을 간단하게 화면위에 보여주게하고 다시 안보기 표시도
// 그리고 오브젝트가 선택되면 컨트롤 표인트의 터치 영역을 조금 넓게 해주고 원근 컨트롤러도 터치 영역 키워줘")
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

const sizeOf = async (page: Page, testid: string) => (await page.getByTestId(testid).first().boundingBox())!.width;

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('처음 들어오면 두 손가락 이동·핀치 확대 안내, [다시 보지 않기]면 다음부터 안 나온다', async ({ page, request }) => {
    await openOwnedProject(page, request, '안내 매장');
    await page.evaluate(() => localStorage.removeItem('ganpanda.touchHelp'));
    await page.reload();
    const help = page.getByTestId('touch-help');
    await expect(help).toBeVisible();
    await expect(help).toContainText('두 손가락');
    await expect(help).toContainText('확대');
    // [확인]만 누르면 이번만 닫힘 → 다시 열면 또 나온다
    await help.getByTestId('touch-help-ok').tap();
    await expect(help).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('touch-help')).toBeVisible();
    await page.getByTestId('touch-help-never').check();
    await page.getByTestId('touch-help-ok').tap();
    await page.reload();
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('touch-help')).toHaveCount(0);
  });

  test('선택한 사인물의 조절점 터치 영역은 48px 이상 (데스크톱은 24px)', async ({ page, request }) => {
    await openOwnedProject(page, request, '터치 매장');
    await uploadPhoto(page);
    await page.evaluate(() => {
      const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
      const id = app.project.addObject({ photoId: app.project.allPhotos()[0].id, name: '첫째', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [] });
      app.selectObject(id);
    });
    await expect(page.getByTestId('sign-handle-hit').first()).toBeAttached();
    expect(await sizeOf(page, 'sign-handle-hit')).toBeGreaterThanOrEqual(47);
    expect(await sizeOf(page, 'edge-hit-0')).toBeGreaterThanOrEqual(47);
  });
});

test('데스크톱 조절점 터치 영역은 그대로(24px), 안내 없음', async ({ page, request }) => {
  await openOwnedProject(page, request, '데스크톱 터치');
  await page.evaluate(() => localStorage.removeItem('ganpanda.touchHelp'));
  await page.reload();
  await uploadPhoto(page);
  await expect(page.getByTestId('touch-help')).toHaveCount(0);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    app.selectObject(app.project.addObject({ photoId: app.project.allPhotos()[0].id, name: '첫째', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [] }));
  });
  await expect(page.getByTestId('sign-handle-hit').first()).toBeAttached();
  const w = await sizeOf(page, 'sign-handle-hit');
  expect(w).toBeGreaterThan(20); expect(w).toBeLessThan(28);
});
