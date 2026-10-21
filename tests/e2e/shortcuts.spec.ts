import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

test.beforeEach(async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
});

const zoom = async (page: Page) => Number((await page.getByTestId('zoom-label').textContent())!.replace('%', ''));
async function hoverCanvas(page: Page) {
  const b = (await page.getByTestId('board-canvas').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
}

test.describe('화면 조작 (xlpop 과 동일)', () => {
  test('⌘/Ctrl + = 확대, - 축소, 0 전체 보기', async ({ page }) => {
    await hoverCanvas(page);
    const z0 = await zoom(page);
    await page.keyboard.press('ControlOrMeta+Equal');
    await expect.poll(() => zoom(page)).toBeGreaterThan(z0);
    await page.keyboard.press('ControlOrMeta+Minus');
    await page.keyboard.press('ControlOrMeta+Minus');
    await expect.poll(() => zoom(page)).toBeLessThan(z0);
    await page.keyboard.press('ControlOrMeta+Digit0');
    await expect.poll(() => zoom(page)).toBe(z0);
  });

  test('스페이스를 누른 채 드래그하면 사진 위에서도 영역 대신 화면이 이동한다', async ({ page }) => {
    await page.keyboard.press('t'); // 사각 도구 상태에서도
    await hoverCanvas(page);
    const before = (await page.getByTestId('photo-img').boundingBox())!;
    await page.keyboard.down('Space');
    await page.mouse.move(before.x + 300, before.y + 200);
    await page.mouse.down();
    await page.mouse.move(before.x + 420, before.y + 260, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const after = (await page.getByTestId('photo-img').boundingBox())!;
    expect(after.x - before.x).toBeCloseTo(120, 0);
    expect(after.y - before.y).toBeCloseTo(60, 0);
    await expect(page.getByTestId('sign-shape')).toHaveCount(0);
  });

  test('마우스 휠은 확대·축소', async ({ page }) => {
    await hoverCanvas(page);
    const z0 = await zoom(page);
    await page.mouse.wheel(0, -100);
    await expect.poll(() => zoom(page)).toBeGreaterThan(z0);
  });
});

test.describe('단축키 설정', () => {
  test('사각 도구를 B 로 바꾸면 B 로 그려지고 R 은 동작하지 않는다 (새로고침 후 유지)', async ({ page }) => {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-keys').click();
    await page.getByTestId('shortcut-edit-toolRect').click();
    await page.keyboard.press('b');
    await expect(page.getByTestId('shortcut-row-toolRect')).toContainText('B');
    await page.getByTestId('close-settings').click();

    await page.keyboard.press('t');
    await dragOnPhoto(page, [400, 200], [800, 300]);
    await expect(page.getByTestId('sign-shape')).toHaveCount(0);

    await page.keyboard.press('b');
    await dragOnPhoto(page, [400, 200], [800, 300]);
    await expect(page.getByTestId('sign-shape')).toHaveCount(1);

    await page.reload();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-keys').click();
    await expect(page.getByTestId('shortcut-row-toolRect')).toContainText('B');
  });

  test('다른 동작과 같은 키를 지정하면 충돌을 알린다', async ({ page }) => {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-keys').click();
    await page.getByTestId('shortcut-edit-toolRect').click();
    await page.keyboard.press('v');
    await expect(page.getByTestId('shortcut-conflict')).toContainText('선택 도구');
  });

  test('Esc 로 입력을 취소하고, 기본값으로 되돌린다', async ({ page }) => {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-keys').click();
    await page.getByTestId('shortcut-edit-toolRect').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcut-row-toolRect')).toContainText('T');
    await page.getByTestId('shortcut-edit-toolRect').click();
    await page.keyboard.press('b');
    await page.getByTestId('shortcuts-reset-all').click();
    await expect(page.getByTestId('shortcut-row-toolRect')).toContainText('T');
    await expect(page.getByTestId('shortcut-row-toolRect')).not.toContainText('B');
  });

  test('단축키 추가: 한 동작에 키를 여러 개', async ({ page }) => {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-keys').click();
    await page.getByTestId('shortcut-add-toolEllipse').click();
    await page.keyboard.press('c');
    await expect(page.getByTestId('shortcut-row-toolEllipse')).toContainText('O');
    await expect(page.getByTestId('shortcut-row-toolEllipse')).toContainText('C');
  });
});
