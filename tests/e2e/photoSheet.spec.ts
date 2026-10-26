// 사진 메뉴를 하단 시트로 (2026-10-26 사용자: "사진을 클릭하면 나오는 리스트가 아이폰과 안드로이드가 다르다. 그리고 현재 사진 클릭하면 이상한데에서 나온다. 그리고 아이콘도 모던한걸로")
// — 전엔 [사진] 목록이 하단 도구 막대 안에 갇혀 왼쪽 아래에 잘려 나왔고, 사진 ⚙ 목록은 화면 오른쪽 밖으로 나갔다.
// 아이폰은 iOS 자체 목록(사진 보관함 · 사진 찍기 · 파일 선택)이 바로, 안드로이드는 같은 항목·순서의 하단 시트
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-F946N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const inView = async (page: Page, id: string) => {
  const b = (await page.getByTestId(id).boundingBox())!, v = page.viewportSize()!;
  return b.x >= 0 && b.y >= 0 && b.x + b.width <= v.width + 0.5 && b.y + b.height <= v.height + 0.5;
};

test.describe('안드로이드', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: ANDROID });
  test('[사진] → 하단 시트: 사진 보관함 · 사진 찍기 · 파일 선택 · 취소 — 화면 안, 사진 찍기는 카메라, 보관함은 여러 장', async ({ page, request }) => {
    await openOwnedProject(page, request);
    await uploadPhoto(page);
    await page.getByTestId('tool-photo').tap();
    const sheet = page.getByTestId('photo-add-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button')).toHaveText(['사진 보관함', '사진 찍기', '파일 선택', '취소']);
    await expect.poll(() => inView(page, 'photo-add-sheet')).toBe(true); // 올라오는 움직임이 끝난 뒤
    for (const b of await sheet.locator('[data-testid^="sheet-item"]').all()) await expect(b.locator('svg')).toHaveCount(1); // 선 아이콘
    let chooser = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: '사진 찍기' }).tap();
    expect(await (await chooser).element().getAttribute('capture')).toBe('environment');
    await expect(sheet).toHaveCount(0);
    await page.getByTestId('tool-photo').tap();
    chooser = page.waitForEvent('filechooser');
    await page.getByTestId('photo-add-sheet').getByRole('button', { name: '사진 보관함' }).tap();
    expect((await chooser).isMultiple()).toBe(true);
    // 취소 · 바깥 탭으로 닫힘
    await page.getByTestId('tool-photo').tap();
    await page.getByTestId('photo-add-sheet').getByRole('button', { name: '취소' }).tap();
    await expect(page.getByTestId('photo-add-sheet')).toHaveCount(0);
  });

  test('사진 ⚙ → 하단 시트로 화면 안에 (이름 변경 · 사진 교체 · 이미지 조절 · 사진 삭제), 머리줄 아이콘은 선 아이콘', async ({ page, request }) => {
    await openOwnedProject(page, request);
    await uploadPhoto(page);
    const zone = page.getByTestId('photo-zone').first();
    for (const id of ['photo-menu', 'render-open']) {
      await expect(zone.getByTestId(id).locator('svg')).toHaveCount(1);
      expect(await zone.getByTestId(id).textContent()).not.toMatch(/[⚙🎨📐]/u);
    }
    await zone.getByTestId('photo-menu').tap();
    const list = page.getByTestId('photo-menu-list');
    await expect(list).toBeVisible();
    await expect.poll(() => inView(page, 'photo-menu-list')).toBe(true);
    for (const t of ['이름 변경', '사진 교체', '이미지 조절', '사진 삭제']) await expect(list).toContainText(t);
    await list.getByRole('button', { name: '취소' }).tap();
    await expect(list).toHaveCount(0);
  });
});

test.describe('아이폰', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, userAgent: IPHONE });
  test('[사진] → iOS 자체 목록이 바로 (우리 시트 없음) — 같은 항목이 두 번 뜨지 않게', async ({ page, request }) => {
    await openOwnedProject(page, request);
    await uploadPhoto(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('tool-photo').tap();
    const c = await chooser;
    expect(c.isMultiple()).toBe(true);
    expect(await c.element().getAttribute('capture')).toBeNull();
    await expect(page.getByTestId('photo-add-sheet')).toHaveCount(0);
  });
});
