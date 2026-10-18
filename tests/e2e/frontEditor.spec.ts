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


// 레이어 패널 (3단계, 2026-10-18): 순서·보이기·잠금·그룹·이름 — 정면도 선택과 같이
test('레이어 패널: 숨기면 정면도·거울에서 빠지고, 잠그면 끌 수 없고, 체크해 그룹으로 묶으면 끌어도 그룹이 남는다', async ({ page, request }) => {
  await setup(page, request);
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="channel"]').click();
  await page.getByTestId('add-item-shape').click();
  await page.getByTestId('object-settings').getByTestId('quick-layout').click();
  const panel = page.getByTestId('layer-panel');
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId('layer-row');
  await expect(rows).toHaveCount(3); // 채널(부모 행) 아래에 그 자식: 위가 맨 위 레이어 → 도형, 글자
  await expect(rows.nth(0)).toHaveAttribute('data-kind', 'channel');
  await expect(rows.nth(1)).toHaveAttribute('data-kind', 'shape');
  await expect(rows.nth(2)).toHaveAttribute('data-kind', 'text');
  const editor = page.getByTestId('front-editor');
  // 패널에서 누르면 정면도도 그 객체를 고른다
  await rows.nth(2).click();
  await expect(editor.getByTestId('front-item').filter({ hasText: '바로바로' })).toHaveAttribute('data-selected', 'true');
  // 숨기기 → 정면도에서 빠지고 거울 parts 에도 없음, 레이어는 남음 → 다시 보이기
  await rows.nth(1).getByTestId('layer-eye').click(); // 도형 숨기기
  await expect(editor.getByTestId('front-item')).toHaveCount(1);
  let o = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { parts: { items: unknown[] }[]; layers: { children: { visible?: boolean }[] }[] }[] } }).__ganpanda.objects[0])));
  expect(o.parts[0].items).toHaveLength(1);
  expect(o.layers[0].children.filter((c: { visible?: boolean }) => c.visible === false)).toHaveLength(1);
  await panel.getByTestId('layer-row').nth(1).getByTestId('layer-eye').click();
  await expect(editor.getByTestId('front-item')).toHaveCount(2);
  // 잠그면 끌어도 움직이지 않는다
  const textRow = panel.getByTestId('layer-row').filter({ hasText: '바로바로' });
  await textRow.getByTestId('layer-lock').click();
  const item = editor.getByTestId('front-item').filter({ hasText: '바로바로' });
  const before = await itemOf(page);
  const b = (await item.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 4 }); await page.mouse.up();
  expect((await itemOf(page)).x).toBe(before.x);
  await textRow.getByTestId('layer-lock').click();
  // 그룹: 글자·도형을 체크 → [그룹] → 그룹 행이 생기고, 이름을 바꾸고, 정면도에서 끌어도 그룹이 남는다
  await panel.getByTestId('layer-row').filter({ hasText: '바로바로' }).getByTestId('layer-check').check();
  await panel.getByTestId('layer-row').filter({ hasText: '도형' }).getByTestId('layer-check').check();
  await panel.getByTestId('layer-group').click();
  const groupRow = panel.getByTestId('layer-row').filter({ has: page.locator('[data-kind="group"]') }).or(panel.locator('[data-testid="layer-row"][data-kind="group"]'));
  await expect(panel.locator('[data-testid="layer-row"][data-kind="group"]')).toHaveCount(1);
  await panel.locator('[data-testid="layer-row"][data-kind="group"]').getByTestId('layer-name').dblclick();
  await panel.getByTestId('layer-name-input').fill('제목 묶음');
  await panel.getByTestId('layer-name-input').press('Enter');
  await expect(panel.locator('[data-testid="layer-row"][data-kind="group"]').getByTestId('layer-name')).toHaveText('제목 묶음');
  const b2 = (await item.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down(); await page.mouse.move(b2.x + b2.width / 2 + 60, b2.y + b2.height / 2, { steps: 4 }); await page.mouse.up();
  expect((await itemOf(page)).x).toBeGreaterThan(before.x);
  o = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: { layers: { children: { kind: string; name?: string; children: unknown[] }[] }[] }[] } }).__ganpanda.objects[0])));
  expect(o.layers[0].children[0]).toMatchObject({ kind: 'group', name: '제목 묶음' });
  expect(o.layers[0].children[0].children).toHaveLength(2);
  void groupRow;
  // 풀기 → 그룹 사라짐, 객체 둘 그대로
  await panel.locator('[data-testid="layer-row"][data-kind="group"]').getByTestId('layer-ungroup').click();
  await expect(panel.locator('[data-testid="layer-row"][data-kind="group"]')).toHaveCount(0);
  await expect(editor.getByTestId('front-item')).toHaveCount(2);
});

// 세트 라이브러리 (4단계, 2026-10-19): 레이어 묶음을 저장해 다른 크기의 사인물에 비율 맞춰 넣는다
test('세트로 저장하고 다른 사인물에 넣으면 그 크기에 비율이 맞는다', async ({ page, request }) => {
  await setup(page, request); // 6000×900 갈바 + 전광 채널 "바로바로" 600
  page.on('dialog', (d) => d.accept('제목 세트'));
  await page.getByTestId('layer-panel').getByTestId('layer-save-set').click(); // 체크 없음 → 전체(채널 + 글자)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { setLibrary: { name: string; frame: { w: number } }[] } }).__ganpanda.setLibrary.map((s) => [s.name, s.frame.w]))).toEqual([['제목 세트', 6000]]);
  await page.getByTestId('close-object-settings').click();
  // 절반 크기의 새 사인물에 넣기
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void; objectSettingsFocus?: string } }).__ganpanda;
    app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '작은', shape: 'rect', quad: [[100, 400], [500, 400], [500, 500], [100, 500]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 450, parts: [] }));
  });
  await openObjectSettings(page);
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-uv').click(); // 구성 요소 카드가 있어야 [+ 세트…] 가 보인다
  await page.getByTestId('add-set').selectOption({ label: '제목 세트' });
  const o = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { selected: { parts: { kind: string; items: { text?: string; h: number; x: number }[] }[] } } }).__ganpanda.selected)));
  const ch = o.parts.find((p: { kind: string }) => p.kind === 'channel');
  expect(ch.items[0]).toMatchObject({ text: '바로바로', h: 300 }); // 600 × 0.5
});
