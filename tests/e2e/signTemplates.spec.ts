// 완성품 퀵 (2026-10-23 사용자: "퀵에서는 간판을 선택하고 사진중에 하나를 선택 … 이전의 완성품 구성에 변경 가능한 필드를 하나씩 대입해서 완성하는 거이야. 중간에 멈추면 거기까지 완성이다.")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

type Obj = { productId?: string; parts?: { kind: string; type: string; options?: Record<string, unknown>; items: { text?: string }[] }[] };
const first = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])) as Obj);

test('간판 → 완성품 사진 → 칸을 하나씩(색 → 글자) → 완성', async ({ page, request }) => {
  await openOwnedProject(page, request, '완성품 퀵');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  const panel = page.getByTestId('object-panel');
  // 간판은 먼저 프레임간판 / 채널간판 (2026-10-27 "간판 종류 선택에 프레임간판, 체널간판 으로 먼저 분류를 하고 세부 사항으로 간다")
  await expect(panel.getByTestId('tpl-family').locator('b')).toHaveText(['프레임간판', '채널간판']);
  await expect(panel.getByTestId('tpl-pick')).toHaveCount(0);
  await panel.getByTestId('tpl-family').filter({ hasText: '프레임간판' }).click();
  await expect(panel.getByTestId('tpl-pick')).toHaveCount(4); // 갈바·후렉스·후렉스+채널·갈바+채널
  await expect(panel.getByTestId('tpl-pick').first().locator('img')).toHaveAttribute('src', '/sign-types/galva.svg');
  await panel.getByTestId('tpl-family-back').click();
  await panel.getByTestId('tpl-family').filter({ hasText: '채널간판' }).click();
  await expect(panel.getByTestId('tpl-pick')).toHaveCount(15);
  await panel.getByTestId('tpl-pick').nth(6).click(); // 07 캡 전후광
  expect((await first(page)).productId).toBe('body-none');
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('1/4 몸통(옆면)색');
  await panel.getByTestId('tpl-next').click();
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('2/4 글자(앞면)색');
  await panel.locator('[data-testid="tpl-color"][title="파랑"]').click();
  await expect.poll(async () => (await first(page)).parts![0].options?.faceSystem).toBe('직접');
  await panel.getByTestId('tpl-next').click();
  await panel.getByTestId('tpl-next').click();
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('4/4 글자');
  await panel.getByTestId('tpl-text').fill('간판다');
  await panel.getByTestId('tpl-text').press('Enter');
  await expect(panel.getByTestId('tpl-step')).toHaveCount(0);
  await expect(panel.getByTestId('tpl-open')).toBeVisible();
  const o = await first(page);
  expect(o.parts![0].type).toBe('ch-both');
  expect(o.parts![0].items[0].text).toBe('간판다');
});

test('중간에 멈추면 거기까지 완성 — 나머지는 완성품 값 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request, '완성품 멈춤');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  const panel = page.getByTestId('object-panel');
  await panel.getByTestId('tpl-family').filter({ hasText: '채널간판' }).click();
  await panel.getByTestId('tpl-pick').nth(8).click(); // 09 후광
  await panel.locator('[data-testid="tpl-color"][title="검정"]').click();
  await panel.getByTestId('tpl-done').click();
  await expect(panel.getByTestId('tpl-step')).toHaveCount(0);
  const o = await first(page);
  expect(o.parts![0].type).toBe('ch-halo');
  expect(o.parts![0].options?.bodyCode).toBe('#141414');
  expect(o.parts![0].items[0].text).toBe('간판'); // 글자 칸까지 안 갔다 → 완성품 기본 글자
  // 이미 구성된 사인물은 사진이 저절로 펼쳐지지 않고 [완성품 사진에서 고르기]
  await expect(panel.getByTestId('tpl-pick')).toHaveCount(0);
  await panel.getByTestId('tpl-open').click();
  await expect(panel.getByTestId('tpl-family')).toHaveCount(2);
});

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('빠른 막대에서도 간판 → 사진 줄 → 칸 채우기, 화면 폭을 넘지 않는다', async ({ page, request }) => {
    await openOwnedProject(page, request);
    await uploadPhoto(page);
    await page.evaluate(() => {
      const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
      app.project.addObject({ photoId: app.project.allPhotos()[0].id, name: '첫째', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [] });
    });
    await page.getByTestId('photo-zone').locator('.name').tap();
    await page.getByTestId('quick-kind').selectOption('sign');
    const bar = page.getByTestId('quick-bar');
    await expect(bar.getByTestId('tpl-family')).toHaveCount(2);
    await bar.getByTestId('tpl-family').filter({ hasText: '채널간판' }).tap();
    await expect(bar.getByTestId('tpl-pick')).toHaveCount(15);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await bar.getByTestId('tpl-pick').nth(3).tap(); // 04 통아크릴
    await expect(bar.getByTestId('tpl-step-label')).toHaveText('1/2 글자(앞면)색');
    await bar.getByTestId('tpl-next').tap();
    await bar.getByTestId('tpl-text').fill('카페');
    await bar.getByTestId('tpl-next').tap(); // 마지막 칸의 [완성] — 입력은 바뀐 값으로
    await expect.poll(async () => (await first(page)).parts?.[0].items[0].text).toBe('카페');
  });
});

test('갈바 간판: 배경색 → 글자색 → 글자, 스카시 분류는 아크릴 스카시', async ({ page, request }) => {
  await openOwnedProject(page, request, '갈바 완성품');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  const panel = page.getByTestId('object-panel');
  await panel.getByTestId('tpl-family').filter({ hasText: '프레임간판' }).click();
  await panel.getByTestId('tpl-pick').first().click();
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('1/3 배경색');
  await panel.locator('[data-testid="tpl-color"][title="노랑"]').click();
  await panel.getByTestId('tpl-next').click();
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('2/3 글자색');
  await panel.getByTestId('tpl-next').click();
  await panel.getByTestId('tpl-text').fill('정육점');
  await panel.getByTestId('tpl-text').press('Enter');
  const o = await first(page) as Obj & { options?: Record<string, unknown> };
  expect(o.productId).toBe('board-galva');
  expect(o.options?.paintSystem).toBe('직접');
  expect(o.parts![0].type).toBe('sh-cut');
  expect(o.parts![0].items[0].text).toBe('정육점');
  await page.getByTestId('photo-zone').screenshot({ path: test.info().outputPath('galva.png') });
  // 스카시로 바꾸면 아크릴 스카시
  await page.getByTestId('category-select').selectOption('scashi');
  await page.getByTestId('category-confirm-ok').click();
  await expect(panel.getByTestId('tpl-family')).toHaveCount(0); // 스카시는 바로 사진
  await expect(panel.getByTestId('tpl-pick')).toHaveCount(1);
  await panel.getByTestId('tpl-pick').click();
  await expect(panel.getByTestId('tpl-step-label')).toHaveText('1/3 아크릴색');
});
