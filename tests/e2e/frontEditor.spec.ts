// 조합형 3단계: 설정 창 안 정면도 편집기 (2026-10-16 사용자: 정면도 편집기는 "2" — 설정 창 안에 따로)
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const itemOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { parts: { items: unknown[] }[] }[] } }).__ganpanda.objects[0].parts[0].items[0])));

async function setup(page: Page, request: Parameters<typeof openOwnedProject>[1]) {
  await openOwnedProject(page, request, '정면도');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('6000');
  await page.getByTestId('height-mm').fill('900');
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-channel').click();
  await page.getByTestId('add-item-text').click();
  await page.getByTestId('item-text').fill('바로바로');
  await page.getByTestId('item-h').fill('600');
  await page.getByTestId('object-settings').getByTestId('quick-layout').click(); // 배치 탭 (2026-10-17 칩 = 탭)
}

test('정면도에서 글자를 끌어 옮기고, 중앙선에 붙고, 정렬·크기·방향키로 다룬다', async ({ page, request }) => {
  await setup(page, request);
  const editor = page.getByTestId('front-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('front-frame')).toBeVisible();
  const item = editor.getByTestId('front-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('바로바로');

  // 오른쪽으로 끌기 → X 가 + 로, 카드의 X 칸도 같이
  const b = (await item.boundingBox())!;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 5 });
  await page.mouse.up();
  const moved = await itemOf(page);
  expect(moved.x).toBeGreaterThan(500);
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="channel"]').click();
  await expect(page.getByTestId('item-x')).toHaveValue(String(moved.x));
  await page.getByTestId('object-settings').getByTestId('quick-layout').click();
  await expect(item).toHaveAttribute('data-selected', 'true');

  // 다시 가운데 근처로 끌면 중앙선(0)에 붙는다
  const b2 = (await item.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 - 58, b2.y + b2.height / 2, { steps: 5 });
  await expect(editor.getByTestId('front-guide')).not.toHaveCount(0); // 세로선은 폭 0 이라 toBeVisible 대신 개수로
  await page.mouse.up();
  expect((await itemOf(page)).x).toBe(0);

  // 정렬: 왼쪽 → 왼쪽 끝이 프레임 왼쪽 끝 (글자 폭 4 × 600 × 0.9 = 2160)
  await editor.getByTestId('align-left').click();
  expect((await itemOf(page)).x).toBe(-3000 + 1080);
  await editor.getByTestId('align-top').click();
  expect((await itemOf(page)).y).toBe(450 - 300);

  // 방향키: 10mm, Shift 100mm
  await editor.getByTestId('front-svg').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const k = await itemOf(page);
  expect([k.x, k.y]).toEqual([-3000 + 1080 + 10, 150 - 100]);

  // 모서리 손잡이로 키우기
  const h = (await editor.getByTestId('front-resize').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  expect((await itemOf(page)).h).toBeGreaterThan(600);
});

test('도형 (2단계): + 도형 으로 넣고 모양·채움을 바꾸면 정면도에 그대로', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="channel"]').click();
  await page.getByTestId('add-item-shape').click();
  const shapeRow = page.getByTestId('part-item').filter({ has: page.getByTestId('item-shape') });
  await expect(shapeRow).toHaveCount(1);
  await shapeRow.getByTestId('item-shape').selectOption('ellipse');
  await shapeRow.getByTestId('item-w').fill('900');
  await page.getByTestId('object-settings').getByTestId('quick-layout').click();
  const editor = page.getByTestId('front-editor');
  await expect(editor.getByTestId('front-item')).toHaveCount(2);
  await expect(editor.locator('ellipse')).toHaveCount(1);
  const parts = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { parts: { items: { kind: string; shape?: string; fill?: string; w?: number }[] }[]; layers: unknown[] }[] } }).__ganpanda.objects[0])));
  expect(parts.parts[0].items[1]).toMatchObject({ kind: 'shape', shape: 'ellipse', w: 900 });
  expect(parts.parts[0].items[1].fill).toMatch(/^#/); // 종류 색으로 채워 시작
  expect(parts.layers).toHaveLength(1); // 레이어 트리도 함께 저장 (1단계)
});

