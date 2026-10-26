// 휴대폰 사진 올리기 (2026-10-24 사용자: "어떤 안드로이드 기계의 경우엔 사진라이브러로 바로 이동해 사진을 찍을 수 없게 되는 경우가 있었다"):
// 터치 기기는 [사진 찍기](카메라 바로 — capture) 와 [앨범에서](여러 장) 를 따로. 데스크톱은 그대로 한 단추
import { expect, test } from '@playwright/test';
import { makePhoto, openOwnedProject } from './helpers';

test.describe('휴대폰', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('빈 보드: [사진 찍기] = 카메라 바로, [앨범에서] = 여러 장 — 찍은 사진이 올라간다', async ({ page, request }) => {
    await openOwnedProject(page, request, '카메라 매장');
    await expect(page.getByTestId('photo-camera')).toBeVisible();
    await expect(page.getByTestId('photo-album')).toBeVisible();
    const cam = page.getByTestId('photo-camera-input');
    await expect(cam).toHaveAttribute('capture', 'environment');
    await expect(cam).toHaveAttribute('accept', 'image/*');
    expect(await cam.evaluate((e: HTMLInputElement) => e.multiple)).toBe(false);
    expect(await page.getByTestId('photo-input').evaluate((e: HTMLInputElement) => e.multiple && !e.hasAttribute('capture'))).toBe(true);
    await cam.setInputFiles({ name: '찍은.png', mimeType: 'image/png', buffer: await makePhoto(page) });
    await expect(page.getByTestId('photo-zone').first()).toBeVisible();
    // 사진이 있으면 도구 막대 [사진] → 하단 시트 (2026-10-26 — 사진 보관함 · 사진 찍기 · 파일 선택)
    await page.getByTestId('tool-photo').tap();
    const menu = page.getByTestId('photo-add-sheet');
    await expect(menu.getByTestId('sheet-item-camera')).toBeVisible();
    await expect(menu.getByTestId('sheet-item-library')).toBeVisible();
  });
});

test('데스크톱은 [사진] 한 단추(파일 고르기) 그대로', async ({ page, request }) => {
  await openOwnedProject(page, request, '데스크톱 매장');
  await expect(page.getByTestId('photo-camera')).toHaveCount(0);
  await expect(page.getByTestId('photo-input')).toHaveCount(1);
});

test.describe('휴대폰 길게 누르기', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('사진을 길게 눌러도 브라우저 메뉴(이미지 저장·공유)가 뜨지 않는다 (2026-10-24 "사진을 길게 누르면 나오는 외부 작동이 있다. 제거해줘")', async ({ page, request }) => {
    await openOwnedProject(page, request, '길게 누르기');
    await page.getByTestId('photo-input').setInputFiles({ name: '정면.png', mimeType: 'image/png', buffer: await makePhoto(page) });
    const img = page.getByTestId('photo-img').first();
    await expect(img).toBeVisible();
    // 안드로이드: 길게 누르면 contextmenu → 막는다
    expect(await img.evaluate((e) => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); e.dispatchEvent(ev); return ev.defaultPrevented; })).toBe(true);
    // 아이폰: 이미지 길게 누르기 메뉴(callout)·글자 선택 끔
    expect(await img.evaluate((e) => { const cs = getComputedStyle(e) as CSSStyleDeclaration & { webkitTouchCallout?: string }; return [cs.webkitTouchCallout ?? 'none', cs.userSelect]; })).toEqual(['none', 'none']);
  });
});

test('데스크톱 오른쪽 클릭은 막지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request, '오른쪽 클릭');
  await page.getByTestId('photo-input').setInputFiles({ name: '정면.png', mimeType: 'image/png', buffer: await makePhoto(page) });
  const img = page.getByTestId('photo-img').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((e) => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); e.dispatchEvent(ev); return ev.defaultPrevented; })).toBe(false);
});
