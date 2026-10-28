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
  await expect(page.getByTestId('object-settings').getByTestId('quick-section')).toBeVisible(); // 칩 = 탭 (2026-10-17)
  await expect(page.getByTestId('option-channel')).toHaveCount(0);
  await expect(page.getByTestId('sheet-sh-cut')).toHaveCount(0);
  await expect(page.getByTestId('sign-text')).toHaveCount(0);
  // 채널 + 글자 두 개 (간판 중앙에서 시작, 위치·크기 mm)
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
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
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-scashi').click();
  const sc = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="scashi"]') });
  await expect(sc.getByTestId('part-stack')).toBeVisible(); // 두께·면판은 재료 층 (2026-10-21)
  await expect(sc.getByTestId('stack-layer')).toHaveCount(0); // 새 스카시는 빈 상태 — 재료를 올리거나 묶음을 고른다 (2026-10-22)
  await sc.getByTestId('part-type').selectOption('ch-rubber'); // 고무 스카시 묶음
  await expect(sc.getByTestId('stack-layer')).toHaveCount(2); // 철판 + 고무
  await sc.getByTestId('add-item-image').click();
  await sc.getByTestId('item-image-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await makePhoto(page) });
  await expect(sc.getByTestId('item-image-name')).toContainText('logo.png');
  // UV 출력 시트: 채널 앞면에도 올릴 수 있다, 그림 객체 크기로 면적
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-uv').click();
  const sh = page.getByTestId('part-card').filter({ has: page.locator('[data-kind="sheet"]') });
  await expect(sh.getByTestId('part-on').locator('option')).toHaveText(['프레임 면', '전광 채널 앞면']);
  // 시트 위에 시트 (2026-10-17 "안개커팅 위에 로고 돔보컷팅"): 재질 시트(안개)를 더하면 UV 시트의 올릴 곳에 "… 위"
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-cut').click();
  // 카드는 탭이라 하나씩 보인다 (2026-10-17 "칩을 일종의 탭으로"): 칩으로 오간다
  const sheetChips = page.getByTestId('object-settings').getByTestId('quick-part').filter({ has: page.locator('[data-kind="sheet"]') });
  const card = page.getByTestId('part-card');
  await card.getByTestId('part-option-sheetMat').selectOption('안개'); // 방금 더한 재질 시트 탭
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="sheet"]').nth(0).click(); // UV 시트 탭
  await expect(card.getByTestId('part-on').locator('option')).toHaveText(['프레임 면', '전광 채널 앞면', '재질 시트 안개 커팅 완컷 위']);
  await card.getByTestId('part-on').selectOption({ label: '재질 시트 안개 커팅 완컷 위' });
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="sheet"]').nth(1).click(); // 안개 시트 탭
  await expect(card.getByTestId('part-on').locator('option')).toHaveText(['프레임 면', '전광 채널 앞면']); // 순환 금지
  await card.getByTestId('part-delete').click(); // 아래 시트를 지우면 프레임 면으로
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="sheet"]').nth(0).click();
  await expect(card.getByTestId('part-on')).toHaveValue('frame');
  expect(sheetChips).toBeTruthy();
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
  await expect(page.locator('.line').filter({ hasText: 'UV 출력' })).toContainText('0.50㎡');
});

test('옛 사인물(채널 옵션 + 문구)은 구성 요소로 보이고, 고치면 구성 요소로 저장된다', async ({ page, request }) => {
  await openOwnedProject(page, request, '옛 사인물');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await page.evaluate(() => { const app = (window as unknown as { __ganpanda: { objects: { id: string }[]; project: { updateObject(id: string, p: unknown): void } } }).__ganpanda; app.project.updateObject(app.objects[0].id, { productId: 'board-galva', text: '간판다', options: { channel: '후광 채널', chType: '캡' } }); });
  await openObjectSettings(page);
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="channel"]').click(); // 채널 탭
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
  await page.getByTestId('option-framePaint-expand').click(); // 컬러 피커 확장 모드
  await page.getByTestId('option-framePaintSystem').selectOption('RAL');
  await expect(page.getByTestId('option-framePaintCode')).toBeVisible();
  await page.getByTestId('option-frameMat').selectOption('텐션 천');
  await expect(page.getByTestId('option-framePaintSystem')).toHaveCount(0); // 천은 도색 없음
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-channel').click();
  const ch = page.getByTestId('part-card').first();
  await expect(ch.getByTestId('part-option-chSideMat')).toBeVisible();
  await expect(ch.getByTestId('part-option-bodyCode')).toHaveCount(0);
  await ch.getByTestId('part-option-body-expand').click();
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

test('모든 분류 조합형 + 중복 정리: 포맥스 두께는 치수 두께 하나, 분류마다 붙일 수 있는 구성 요소만', async ({ page, request }) => {
  // 2026-10-16 사용자: "사인물 상세설정들을 모두 조합형으로 변경해주고 중복도 확인해줘 포맥스의 경우 실측에 두께가 있어 포멕스 두께가 따로표시 중복된다."
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'foamex');
  await openObjectSettings(page);
  await expect(page.getByTestId('option-thick')).toHaveCount(0);
  await expect(page.getByTestId('option-uvSheet')).toHaveCount(0);
  // 두께는 소재(종류) 아래, 치수는 가로·세로만 (2026-10-16 "두께는 소재에 붙이는게 맞을 거 같은데")
  await expect(page.getByTestId('size-section').getByTestId('depth-mm')).toHaveCount(0);
  await page.getByTestId('thickness').getByTestId('thick-5').click();
  await expect(page.getByTestId('thickness').getByTestId('depth-mm')).toHaveValue('5');
  await page.getByTestId('width-mm').fill('600');
  await page.getByTestId('height-mm').fill('400');
  // 포맥스: 시트·스카시만 ([+] 메뉴)
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await expect(page.getByTestId('add-part-channel')).toHaveCount(0);
  await page.getByTestId('add-part-sheet-uv').click();
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-scashi').click();
  await expect(page.getByTestId('object-settings').getByTestId('quick-part')).toHaveCount(2); // 칩 둘 (탭이라 카드는 하나씩)
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('object-summary')).toContainText('포맥스 · 5T');
  await expect(page.getByTestId('object-summary')).toContainText('600×400mm');
  await expect(page.getByTestId('object-summary')).not.toContainText('×5mm');
  // 현수막으로 바꾸면 구성 요소가 없다 (현수막 자체가 출력물)
  await pickCategory(page, 'banner');
  await openObjectSettings(page);
  await expect(page.getByTestId('parts-section')).toHaveCount(0);
  await expect(page.getByTestId('thickness')).toHaveCount(0); // 현수막은 두께 없음
  await page.getByTestId('close-object-settings').click();
  // 시트 분류: 시트 구성 요소 카드, 시트 칩·문구 칸 없음
  await pickCategory(page, 'sheet');
  await openObjectSettings(page);
  await expect(page.getByTestId('part-card')).toHaveCount(1); // 시트 분류: 첫 탭이 시트 카드
  await expect(page.getByTestId('sign-text')).toHaveCount(0);
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await expect(page.getByTestId('add-part-scashi')).toHaveCount(0);
  await page.getByTestId('add-part-sheet-uv').click();
  await expect(page.getByTestId('object-settings').getByTestId('quick-part')).toHaveCount(2);
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('category-select')).toHaveValue('sheet'); // 시트가 구성 요소로 옮겨져도 시트 분류
  // 스카시 분류: 스카시 구성 요소, 치수 두께 칸 없음(스카시 두께와 겹침)
  await pickCategory(page, 'scashi');
  await openObjectSettings(page);
  await expect(page.getByTestId('depth-mm')).toHaveCount(0);
  await page.getByTestId('object-settings').locator('[data-testid="quick-part"][data-kind="scashi"]').click(); // 스카시 탭
  await expect(page.getByTestId('part-card')).toHaveCount(1); // 스카시 분류는 스카시 카드 하나로 시작 (사인물 자체가 스카시)
  await expect(page.getByTestId('part-card').getByTestId('part-stack')).toBeVisible(); // 두께는 재료 층 (2026-10-21)
  await expect(page.getByTestId('option-thickness')).toHaveCount(0); // 몸통 쪽 두께와 겹치지 않음
});

test('시트 = UV 출력 / 재질 시트, 컷팅은 옵션(돔보컷팅·커팅, 완컷·반컷, 완컷이면 보조시트), 문구가 없으면 구성내역', async ({ page, request }) => {
  // 2026-10-16 사용자: "시트는 uv출력, 재질로 분류하고 여기에서 커팅(uv실사에 맞게 컷팅하는 것을 돔보컷팅이라한다)을 옵션으로 넣는다.
  // 컷팅에는 반컷, 완컷(보조시트 체크) 그리고 문구가 없으면 구성내역을 문자에 넣는다. uv출력 돔보컷팅 완컷"
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sheet');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('2000');
  await page.getByTestId('height-mm').fill('1000');
  const card = page.getByTestId('part-card').first();
  await card.getByTestId('part-type').selectOption('sh-print');
  await expect(card.getByTestId('part-type').locator('option')).toHaveText(['UV 출력', '재질 시트']);
  await expect(card.getByTestId('part-spec')).toHaveText('UV 출력 돔보컷팅 완컷');
  await expect(card.getByTestId('part-option-cut')).toHaveValue('돔보컷팅');
  await card.getByTestId('part-option-transferTape').check();
  await expect(card.getByTestId('part-spec')).toHaveText('UV 출력 돔보컷팅 완컷 보조시트');
  await card.getByTestId('part-option-cutMode').selectOption('반컷');
  await expect(card.getByTestId('part-option-transferTape')).toHaveCount(0); // 보조시트는 완컷일 때만
  await card.getByTestId('part-option-cutMode').selectOption('완컷');
  await card.getByTestId('part-option-cut').selectOption('컷팅 없음');
  await expect(card.getByTestId('part-option-cutMode')).toHaveCount(0);
  await card.getByTestId('part-option-cut').selectOption('돔보컷팅');
  await page.getByTestId('object-settings').getByTestId('quick-add').click();
  await page.getByTestId('add-part-sheet-cut').click();
  const mat = page.getByTestId('part-card'); // 방금 더한 재질 시트 탭
  await mat.getByTestId('part-option-sheetMat').selectOption('반사');
  await expect(mat.getByTestId('part-spec')).toHaveText('재질 시트 반사 커팅 완컷');
  await page.getByTestId('close-object-settings').click();
  // 견적 줄 이름 = 구성내역, 문구가 없으면 견적서에 구성내역
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: 'UV 출력 돔보컷팅 완컷' })).toHaveCount(1);
  await page.getByTestId('open-quote-sheet').click();
  await expect(page.getByTestId('quote-sheet')).toContainText('“UV 출력 돔보컷팅 완컷 보조시트 + 재질 시트 반사 커팅 완컷”');
});

test('스카시 재료 층: 고무 스카시 = 철판 + 고무 묶음, 철판을 빼면 고무만(견적 줄에 "철판 없음"), 앞면에 시트를 더하면 시트 줄, 면판 더하기·기본으로 (2026-10-21)', async ({ page, request }) => {
  // 2026-10-21 사용자: "스카시 선택하면 고무를 선택했다 하고 여기에 기본은 얇은 철판인데 어떤 경우는 고무만 사용하잖아. 나는 이때 결합된 상태로 제공하고 필요한 상태를 추가하고 싶은 거야 시트나 페인트를"
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'scashi');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('width-mm').fill('3000');
  await dlg.getByTestId('height-mm').fill('600');
  await dlg.locator('[data-testid="quick-part"][data-kind="scashi"]').click(); // 스카시 탭
  const sc = dlg.getByTestId('part-card').filter({ has: page.locator('[data-kind="scashi"]') });
  await sc.getByTestId('add-item-text').click();
  await sc.getByTestId('item-text').fill('간판다');
  const layers = sc.getByTestId('stack-layer');
  await expect(layers).toHaveCount(2);
  await expect(layers.first()).toHaveAttribute('data-material', 'rubber'); // 위가 앞(고무), 아래가 뒤(철판)
  await expect(layers.last()).toHaveAttribute('data-material', 'iron');
  await expect(sc.getByTestId('part-stack')).toContainText('21.5T');
  const depth = () => page.evaluate(() => { const a = (window as unknown as { __ganpanda: { selected: { parts: { stack: { thickness: number }[] }[] } } }).__ganpanda; return a.selected.parts[0].stack.reduce((t, l) => t + l.thickness, 0); });
  const quoteLabels = () => page.evaluate(() => { const q = (window as unknown as { __ganpanda: { quote: { lines?: { label: string }[] } | { label: string }[] } }).__ganpanda.quote; return (Array.isArray(q) ? q : q.lines ?? []).map((l) => l.label).join(' | '); });
  // 철판 빼기 → 고무만, 두께 20, 견적 줄에 (철판 없음)
  await layers.last().getByTestId('layer-delete').click();
  await expect(layers).toHaveCount(1);
  expect(await depth()).toBe(20);
  await expect.poll(quoteLabels).toContain('철판 없음');
  // 앞면 시트 → 시트 줄
  await layers.first().getByTestId('layer-face').selectOption('sheet:sh-cut');
  await expect.poll(quoteLabels).toContain('앞면 시트');
  // 앞에 면판 더하기 → 2층, 기본으로 → 철판 + 고무
  await sc.getByTestId('stack-add-top').click();
  await expect(layers).toHaveCount(2);
  await expect(layers.first()).toHaveAttribute('data-material', 'alu');
  await sc.getByTestId('stack-reset').click();
  await expect(layers).toHaveCount(2);
  await expect(layers.last()).toHaveAttribute('data-material', 'iron');
  expect(await depth()).toBe(21.5);
});

test('UV 후렉스 출력: 몸통에 배경색(미리보기), [+ 글자]·[+ 그림]은 미리보기 구성 요소(디자이너 참고 — 컷팅 옵션·견적 줄 없음)로, 2D 사진 위에 글자가 보인다 (2026-10-21)', async ({ page, request }) => {
  // 2026-10-21 사용자: "uv후렉스출력에 배경색 글자 그림 옵션 넣어줘"
  await openOwnedProject(page, request);
  await page.getByTestId('stage-2d').click(); // 2D 탭 (2026-10-22 작업 탭 실측·2D·3D·디자인·리스트)
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('product-select').selectOption('board-flex');
  await dlg.getByTestId('width-mm').fill('3000');
  await dlg.getByTestId('height-mm').fill('600');
  await expect(dlg.getByTestId('option-face-color')).toContainText('배경색 (미리보기)'); // 미리보기 묶음 (사양 아님)
  await expect(dlg.locator('[data-testid="option-group"][data-preview="true"]').getByTestId('preview-hint')).toBeVisible();
  await dlg.getByTestId('add-print-text').click();
  const card = dlg.getByTestId('part-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('part-spec')).toContainText('출력 미리보기 (디자이너 참고)');
  await expect(card.getByTestId('part-option-cut')).toHaveCount(0); // 시트 옵션 없음
  await card.getByTestId('item-text').fill('바로바로정육점');
  // 두 번째 글자·그림도 같은 출력 구성 요소에
  await dlg.locator('[data-testid="quick-part"][data-kind="sheet"]').waitFor();
  await dlg.getByTestId('quick-body').click();
  await dlg.getByTestId('add-print-image').click();
  await expect(dlg.getByTestId('part-card')).toHaveCount(1);
  await expect(dlg.getByTestId('part-item')).toHaveCount(2);
  // 견적: 후렉스 몸통 줄만 (출력은 포함)
  const labels = await page.evaluate(() => { const q = (window as unknown as { __ganpanda: { quote: { lines?: { label: string }[] } | { label: string }[] } }).__ganpanda.quote; return (Array.isArray(q) ? q : q.lines ?? []).map((l) => l.label); });
  expect(labels.some((l) => l.includes('후렉스'))).toBe(true);
  expect(labels.some((l) => l.includes('출력'))).toBe(false);
  await page.getByTestId('close-object-settings').click();
  await expect(page.getByTestId('photo-zone').getByAltText('바로바로정육점').first()).toBeVisible(); // 2D 사진 위 출력 글자 (구운 그림, 2026-10-29)
});
