// 아이폰 노치·상태 표시줄 (2026-10-27 사용자: "원근세부창 아이폰에서 x마크 휴대폰상단 표시로 가서 잘 안잡힘")
// 앱은 viewport-fit=cover 로 화면 끝까지 그린다 → 휴대폰에서 전체 화면이 되는 창은 위·아래 안전 영역만큼 띄워야 닫기(✕)가 상태 표시줄 아래에 온다
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
type G = { __ganpanda: { photos: { id: string }[]; openCamera(id: string): void; adjustPhotoId: string | null } };
const TOP = 47, BOTTOM = 34;

async function notch(page: Page) {
  const c = await page.context().newCDPSession(page);
  await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: TOP, bottom: BOTTOM } });
}
async function closeReachable(page: Page, testid: string) {
  const b = (await page.getByTestId(testid).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(TOP); // 상태 표시줄 아래
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40); // 손가락으로 잡히는 크기
}

test('휴대폰 전체 화면 창(원근 맞추기·사진 다듬기)의 닫기(✕)는 상태 표시줄 아래, 잡기 쉬운 크기', async ({ page, request }) => {
  await openOwnedProject(page, request, '노치');
  await uploadPhoto(page);
  await notch(page);
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; a.openCamera(a.photos[0].id); });
  await expect(page.getByTestId('camera-dialog')).toBeVisible();
  await closeReachable(page, 'close-camera');
  await page.getByTestId('close-camera').tap();
  await expect(page.getByTestId('camera-dialog')).toHaveCount(0);
  await page.evaluate(() => { const a = (window as unknown as G).__ganpanda; a.adjustPhotoId = a.photos[0].id; });
  await closeReachable(page, 'close-photo-adjust');
});
