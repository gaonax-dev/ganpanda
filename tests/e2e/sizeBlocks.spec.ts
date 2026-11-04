// 치수 블록 (2026-11-03 사용자: "일반 사인물처럼 네모를 그리면 설정이 하나인 사각이 두개가 되고 … 치수블록은 핫핑크라인으로 … 정확도가 향상된면 보라색으로")
import { expect, test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';

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
