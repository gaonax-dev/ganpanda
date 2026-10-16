// 조합형 사인물 2단계: 설정 창의 구성 요소 UI (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트…", "5.1~2 단계 진행")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, makePhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('간판 프레임 아래 구성 요소: 채널·스카시·시트를 추가하고, 글자·그림 객체를 넣고, 요약·견적에 반영된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '조합형');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('6000');
  await page.getByTestId('height-mm').fill('900');
  // 간판 프레임의 채널·스카시 선택과 시트 칩·문구 칸 대신 구성 요소
  await expect(page.getByTestId('parts-section')).toBeVisible();
  await expect(page.getByTestId('option-channel')).toHaveCount(0);
  await expect(page.getByTestId('sheet-sh-cut')).toHaveCount(0);
  await expect(page.getByTestId('sign-text')).toHaveCount(0);
  // 채널 + 글자 두 개 (간판 중앙에서 시작, 위치·크기 mm)
  await page.getByTestId('add-part-channel').click();
  const ch = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="channel"]') });
  await expect(ch.getByTestId('part-type')).toHaveValue('ch-front');
  await expect(ch.getByTestId('part-option-chType')).toBeVisible();
  await ch.getByTestId('add-item-text').click();
  await ch.getByTestId('item-text').fill('바로바로');
  await ch.getByTestId('item-h').fill('600');
  await expect(ch.getByTestId('item-x')).toHaveValue('0');
  await ch.getByTestId('add-item-text').click();
  await ch.getByTestId('item-text').nth(1).fill('정육점');
  await ch.getByTestId('item-h').nth(1).fill('300');
  await ch.getByTestId('item-y').nth(1).fill('-350');
  // 스카시 (글자·그림 모두)
  await page.getByTestId('add-part-scashi').click();
  const sc = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="scashi"]') });
  await expect(sc.getByTestId('part-option-thickness')).toBeVisible();
  await sc.getByTestId('add-item-image').click();
  await sc.getByTestId('item-image-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await makePhoto(page) });
  await expect(sc.getByTestId('item-image-name')).toContainText('logo.png');
  // UV 출력 시트: 채널 앞면에도 올릴 수 있다, 그림 객체 크기로 면적
  await page.getByTestId('add-part-sheet-uv').click();
  const sh = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="sheet"]') });
  await expect(sh.getByTestId('part-on').locator('option')).toHaveText(['프레임 면', '전광 채널 앞면']);
  await sh.getByTestId('add-item-image').click();
  await sh.getByTestId('item-w').fill('1000');
  await sh.getByTestId('item-h').fill('500');
  const o = await objOf(page);
  expect(o.parts.map((p: { kind: string }) => p.kind)).toEqual(['channel', 'scashi', 'sheet']);
  expect(o.parts[0].items.map((i: { text: string; y: number }) => [i.text, i.y])).toEqual([['바로바로', 0], ['정육점', -350]]);
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('전광 채널 "바로바로" 600mm "정육점" 300mm');
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: '전광 채널' })).toContainText('"바로바로" 4자×600mm + "정육점" 3자×300mm');
  await expect(page.locator('.line').filter({ hasText: 'UV 실사' })).toContainText('0.50㎡');
});

test('옛 사인물(채널 옵션 + 문구)은 구성 요소로 보이고, 고치면 구성 요소로 저장된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '옛 사인물');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { productId: 'board-galva', text: '간판다', options: { channel: '후광 채널', chType: '캡' } }); });
  await openObjectSettings(page);
  const ch = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="channel"]') });
  await expect(ch.getByTestId('part-type')).toHaveValue('ch-halo');
  await expect(ch.getByTestId('item-text')).toHaveValue('간판다');
  await ch.getByTestId('item-text').fill('간판다 카페');
  await expect.poll(async () => (await objOf(page)).parts?.[0]?.items?.[0]?.text).toBe('간판다 카페');
  const o = await objOf(page);
  expect(o.options?.channel).toBeUndefined();
  expect(o.parts[0]).toMatchObject({ kind: 'channel', type: 'ch-halo', options: { chType: '캡' } });
});

test('재질·도색 객체: 채널 측면 재질 + 도색(체계 → 코드·광택), 전광은 앞면 아크릴/PC판, 간판 프레임 재질 + 도색', async ({ page, request }) => {
  // 2026-10-16 사용자: "재질객체에 스텐, 철, 알루미늄 여기에 도색 객체를 추가해 사용한다… 체널 전광의 경우 pc판도 선택할 수 있다"
  await openOwnedProject(page, request, '재질 도색');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('product-select').selectOption('board-truss');
  await expect(page.getByTestId('option-frameMat').locator('option')).toHaveText(['스텐', '철', '알루미늄', '텐션 천']);
  await page.getByTestId('option-framePaintSystem').selectOption('RAL');
  await expect(page.getByTestId('option-framePaintCode')).toBeVisible();
  await page.getByTestId('option-frameMat').selectOption('텐션 천');
  await expect(page.getByTestId('option-framePaintSystem')).toHaveCount(0); // 천은 도색 없음
  await page.getByTestId('add-part-channel').click();
  const ch = page.getByTestId('part-card').first();
  await expect(ch.getByTestId('part-option-chSideMat')).toBeVisible();
  await expect(ch.getByTestId('part-option-bodyCode')).toHaveCount(0);
  await ch.getByTestId('part-option-bodySystem').selectOption('KCC');
  await expect(ch.getByTestId('part-option-bodyGloss')).toBeVisible();
  await ch.getByTestId('part-option-chFace').selectOption('PC판');
  await ch.getByTestId('part-type').selectOption('ch-halo');
  await expect(ch.getByTestId('part-option-chFace')).toHaveCount(0); // 후광은 앞면 판 없음
});

test('사인물 설정 창: 전체 치수가 맨 위', async ({ page, request }) => {
  // 2026-10-16 사용자: "치수가 가장 아래있어. 사인물 전체 치수는 최상단에"
  await openOwnedProject(page, request, '치수 위치');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await expect(page.getByTestId('object-settings').locator('.body > section').first().locator('h3')).toContainText('치수');
});
