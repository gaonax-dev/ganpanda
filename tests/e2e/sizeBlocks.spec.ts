// 치수 블록 (2026-11-03 사용자: "일반 사인물처럼 네모를 그리면 설정이 하나인 사각이 두개가 되고 … 치수블록은 핫핑크라인으로 … 정확도가 향상된면 보라색으로")
import { expect, test } from '@playwright/test';
import { clearAutoCamera, dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

type Hook = { photos: { id: string }[]; project: { addObject(o: unknown): string; object(id: string): { quad: number[][]; blocks?: number[][][] } | undefined }; selectObject(id: string | null): void; signs: unknown[]; tool: string; selectedId: string | null };

test('치수를 넣은 사인물을 고르면 [블록] 도구가 열리고, 그린 네모는 새 사인물이 아니라 그 사인물의 치수 블록(형광) — 크기가 맞으면 보라, 아니면 빨간 크기 글자. 블록을 누르면 사인물과 같은 손잡이(벽축 핸들 포함), Delete 로 지움', async ({ page, request }) => {
  await openOwnedProject(page, request, '치수 블록');
  await uploadPhoto(page);
  const [sized, unsized] = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: Hook }).__ganpanda;
    const a = g.project.addObject({ photoId: g.photos[0].id, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    const b = g.project.addObject({ photoId: g.photos[0].id, name: '모름', shape: 'rect', quad: [[1200, 100], [1500, 100], [1500, 200], [1200, 200]], sheetIds: [] });
    return [a, b];
  });
  const toolBlock = page.getByTestId('tool-block');
  // 아무것도 안 골랐거나 치수 없는 사인물을 고르면 꺼져 있다
  await expect(toolBlock).toBeDisabled();
  await page.evaluate((id) => (window as unknown as { __ganpanda: Hook }).__ganpanda.selectObject(id), unsized);
  await expect(toolBlock).toBeDisabled();
  await page.evaluate((id) => (window as unknown as { __ganpanda: Hook }).__ganpanda.selectObject(id), sized);
  await expect(toolBlock).toBeEnabled();
  await toolBlock.click();
  await expect(toolBlock).toHaveClass(/on/);
  // 사인물과 같은 크기(400×100px — 정면 사진이라 4000×1000mm)의 네모를 그린다 → 블록 1개, 사인물 수는 그대로 2
  await dragOnPhoto(page, [600, 300], [1000, 400]);
  const blocks = page.getByTestId('size-block');
  await expect(blocks).toHaveCount(1);
  await expect(blocks.first()).toHaveAttribute('data-id', sized);
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: Hook }).__ganpanda.signs.length)).toBe(2);
  expect(await page.evaluate((id) => (window as unknown as { __ganpanda: Hook }).__ganpanda.project.object(id)?.blocks?.length, sized)).toBe(1);
  // 크기가 맞으니 보라 (정확도 향상), 크기 글자도 보라
  await expect(blocks.first()).toHaveAttribute('data-fit', '1');
  const stroke = (i: number) => page.getByTestId('size-block').nth(i).locator('polygon').first().evaluate((e) => getComputedStyle(e).stroke);
  expect(await stroke(0)).toBe('rgb(168, 85, 247)');
  await expect(page.getByTestId('block-size').first()).toHaveText(/≈\s?4,000\s?×\s?1,000/);
  // 도구는 그대로 블록 — 연속으로 더 그린다 (모서리를 이어 가는 작업). 이번엔 절반 크기 → 사인물 치수와 안 맞아 형광 초록, 크기 글자 빨강
  await expect(toolBlock).toHaveClass(/on/);
  await dragOnPhoto(page, [600, 500], [800, 600]);
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(1)).not.toHaveAttribute('data-fit', '1');
  expect(await stroke(1)).toBe('rgb(57, 255, 20)');
  const sizeText = page.getByTestId('block-size').nth(1);
  await expect(sizeText).toHaveText(/≈\s?2,000\s?×\s?1,000/);
  expect(await sizeText.evaluate((e) => getComputedStyle(e).fill)).toBe('rgb(239, 68, 68)');
  // 원근은 사인물 + 블록으로 자동으로 잡혔다 (치수 입력과 같은 흐름)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { photos: { camera?: { extra?: { x?: unknown[] } } }[] } }).__ganpanda.photos[0].camera?.extra?.x?.length)).toBe(4);
  // 선택 도구로 돌아가 블록을 누르면 블록이 선택되고(사인물도 그대로 선택) 사인물과 같은 조작 손잡이가 블록에 붙는다 — 꼭짓점 4개·변 4개·원근 매니퓰레이터(2026-11-04 "사인물과 같이 컨트롤러가 있어야")
  await page.keyboard.press('Escape');
  await expect(toolBlock).not.toHaveClass(/on/);
  await expect(page.getByTestId('sign-controls')).not.toHaveAttribute('data-block', /\d/);
  await blocks.nth(1).locator('polygon').first().dispatchEvent('pointerdown', { button: 0, pointerId: 1, isPrimary: true, pointerType: 'mouse', bubbles: true, clientX: 0, clientY: 0 });
  await page.mouse.up();
  const controls = page.getByTestId('sign-controls');
  await expect(controls).toHaveAttribute('data-block', '1');
  await expect(controls.getByTestId('sign-handle')).toHaveCount(4);
  await expect(controls.locator('[data-testid^="edge-handle-"]')).toHaveCount(4);
  await expect(controls.getByTestId('gizmo')).toHaveCount(1);
  await expect(blocks.nth(1)).toHaveAttribute('data-selected', 'true');
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: Hook }).__ganpanda.selectedId)).toBe(sized);
  // 꼭짓점 손잡이를 끌면 블록만 바뀐다 (사인물 외곽선은 그대로)
  const h = controls.getByTestId('sign-handle').nth(2);
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate((id) => { const o = (window as unknown as { __ganpanda: Hook }).__ganpanda.project.object(id)!; return { quad: o.quad, block: o.blocks![1] }; }, sized);
  expect(after.quad).toEqual([[100, 100], [500, 100], [500, 200], [100, 200]]);
  expect(after.block[2][0]).toBeGreaterThan(800);
  // 벽축 핸들(면 막대·끝 동그라미)도 사인물과 같다. ✕ 는 없다 — Delete 키로 두 번째 블록을 지운다 (2026-11-04)
  await expect(controls.getByTestId('face-bar')).toHaveCount(1);
  await expect(controls.getByTestId('face-cycle')).toHaveCount(1);
  await expect(page.getByTestId('size-block-remove')).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(blocks).toHaveCount(1);
  expect(await page.evaluate((id) => (window as unknown as { __ganpanda: Hook }).__ganpanda.project.object(id)?.blocks?.length, sized)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: Hook }).__ganpanda.signs.length)).toBe(2); // 사인물은 지워지지 않는다
  // 다른 사인물을 고르면 손잡이는 그 사인물로 가고 블록은 그대로 보인다
  await page.evaluate((id) => (window as unknown as { __ganpanda: Hook }).__ganpanda.selectObject(id), unsized);
  await expect(page.getByTestId('sign-controls')).not.toHaveAttribute('data-block', /\d/);
  await expect(blocks).toHaveCount(1);
});

test('블록을 고르면 속성은 사이즈·축만 바로(휴대폰도) — 사이즈를 바꾸면 사인물 치수가 바뀌어 다른 사인물 추정과 다른 사진의 같은 사인물도 따르고, 축을 정하면 저장 (2026-11-04 "블록은 속성이 사이즈와 축설정만 … 다른 사인물의 길이가 조정된다 … 다른 사진에도 사용되었다면 현재 조정하는 사진의 블록 변경을 따른다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 속성');
  await uploadPhoto(page);
  await uploadPhoto(page);
  await page.waitForTimeout(1500); // 등록 즉시 자동 원근(AI)이 끝나기를 기다렸다가 끈다 — 이 시험은 원근 없는 축척(기준 영역)으로
  await clearAutoCamera(page);
  type H2 = Hook & { photos: { id: string }[]; project: Hook['project'] & { updateObject(id: string, p: unknown): void; linkObject(id: string, m: string): void }; selectBlock(id: string, i: number): void; measures: Map<string, { estimate?: { widthMm: number } }>; objects: { id: string; widthMm?: number; blockAxes?: (string | null)[] }[] };
  const ids = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: H2 }).__ganpanda;
    const [p1, p2] = g.photos.map((p) => p.id);
    const a = g.project.addObject({ photoId: p1, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000, blocks: [[[600, 300], [1000, 300], [1000, 400], [600, 400]]] });
    const u = g.project.addObject({ photoId: p1, name: '모름', shape: 'rect', quad: [[1200, 100], [1400, 100], [1400, 200], [1200, 200]], sheetIds: [] });
    const a2 = g.project.addObject({ photoId: p2, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [] });
    g.project.linkObject(a2, a);
    const u2 = g.project.addObject({ photoId: p2, name: '모름2', shape: 'rect', quad: [[1200, 100], [1400, 100], [1400, 200], [1200, 200]], sheetIds: [] });
    g.selectBlock(a, 0);
    return { a, u, a2, u2 };
  });
  const panel = page.getByTestId('block-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  await expect(panel.locator('input')).toHaveCount(2); // 가로·세로뿐
  await expect(panel.getByTestId('block-width')).toHaveValue('4000');
  await expect(panel.locator('[data-testid^="block-axis-"]')).toHaveCount(3);
  await expect(panel.getByTestId('block-axis-y')).toHaveAttribute('aria-checked', 'true'); // 정면 사진의 블록 = 벽면(자동)
  const est = (id: string) => page.evaluate((id) => (window as unknown as { __ganpanda: H2 }).__ganpanda.measures.get(id)?.estimate?.widthMm ?? 0, id);
  await expect.poll(() => est(ids.u)).toBeGreaterThan(1900);
  expect(await est(ids.u)).toBeLessThan(2100); // 200px = 2000mm
  // 블록 사이즈를 8000 으로 → 사인물 치수 8000, 같은 사진 '모름' 은 두 배, 다른 사진의 같은 사인물도 8000 → 그 사진 '모름2' 도 따른다
  await panel.getByTestId('block-width').fill('8000');
  await expect.poll(() => page.evaluate((id) => (window as unknown as { __ganpanda: H2 }).__ganpanda.objects.find((o) => o.id === id)?.widthMm, ids.a2)).toBe(8000);
  await expect.poll(() => est(ids.u)).toBeGreaterThan(3500);
  await expect.poll(() => est(ids.u2)).toBeGreaterThan(3500);
  // 축 정하기 → 저장
  await panel.getByTestId('block-axis-x').click();
  await expect.poll(() => page.evaluate((id) => (window as unknown as { __ganpanda: H2 }).__ganpanda.objects.find((o) => o.id === id)?.blockAxes, ids.a)).toEqual(['x']);
  await panel.getByTestId('block-axis-y').click();
  await expect(panel.getByTestId('block-axis-y')).toHaveAttribute('aria-checked', 'true');
  // 휴대폰 폭에서도 블록을 고르면 빠른 막대 대신 이 패널
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('quick-size')).toHaveCount(0);
});

test('원근이 잡힌 사진에서 조금 비뚤게 그린 블록도 크기(≈)가 나온다 — 축을 안 정하면 벽면에서 잰다 (2026-11-04 "블록 사이즈 입력했는데 사이즈 나오지 않는다")', async ({ page, request }) => {
  await openOwnedProject(page, request, '블록 크기 표시');
  await uploadPhoto(page);
  const a = await page.evaluate(() => {
    const g = (window as unknown as { __ganpanda: Hook & { selectObject(id: string): void } }).__ganpanda;
    const a = g.project.addObject({ photoId: g.photos[0].id, name: '기준', shape: 'rect', quad: [[100, 100], [500, 100], [500, 200], [100, 200]], sheetIds: [], widthMm: 4000, heightMm: 1000 });
    g.selectObject(a);
    return a;
  });
  await page.getByTestId('camera-auto').click();
  await expect(page.getByTestId('camera-level')).toHaveAttribute('data-level', '3');
  // 손으로 그린 듯 꼭짓점이 몇십 px 어긋난 블록
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { blocks: [[[600, 300], [1010, 290], [1000, 420], [590, 400]]] }), a);
  await expect(page.getByTestId('block-size')).toHaveCount(1);
  await expect(page.getByTestId('block-size')).toHaveText(/≈\s?[\d,]+\s?×\s?[\d,]+/);
  // 비뚤게 그린 블록으로 원근을 다시 잡아도 같은 사진의 치수 없는 사인물 추정은 사라지지 않는다 (어느 면에도 딱 맞지 않으면 벽면에서 잰다)
  const u = await page.evaluate(() => { const g = (window as unknown as { __ganpanda: Hook }).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '모름', shape: 'rect', quad: [[1100, 100], [1400, 100], [1400, 200], [1100, 200]], sheetIds: [] }); });
  await page.getByTestId('camera-auto').click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __ganpanda: { photos: { camera?: { extra?: unknown } }[] } }).__ganpanda.photos[0].camera?.extra)).toBe(true);
  await expect.poll(() => page.evaluate((u) => (window as unknown as { __ganpanda: { measures: Map<string, { estimate?: { widthMm: number } }> } }).__ganpanda.measures.get(u)?.estimate?.widthMm ?? 0, u)).toBeGreaterThan(2000);
  // 블록 패널에서 사이즈를 넣어도 크기는 계속 나온다
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectBlock(id: string, i: number): void } }).__ganpanda.selectBlock(id, 0), a);
  await page.getByTestId('block-width').fill('5000');
  await expect(page.getByTestId('block-size')).toHaveCount(1);
  await expect(page.getByTestId('block-panel-est')).toBeVisible();
});
