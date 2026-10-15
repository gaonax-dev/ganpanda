// 사인물 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

type Pt = [number, number];
const signs = (page: Page) => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { id: string; name: string; quad: Pt[]; widthMm?: number; text?: string }[] } }).__ganpanda.objects.map((o) => ({ id: o.id, name: o.name, quad: o.quad, widthMm: o.widthMm, text: o.text })));

test('⌘/Ctrl+C → ⌘/Ctrl+V 로 붙이면 규격이 같은 "… 복사" 사인물이 조금 비켜 생기고, 붙일 때마다 더 비킨다. ⌘/Ctrl+D 는 바로 복제. ⌘/Ctrl+Z 로 되돌린다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  const [orig] = await signs(page);
  await page.evaluate((id) => (window as unknown as { __ganpanda: { project: { updateObject(id: string, p: unknown): void } } }).__ganpanda.project.updateObject(id, { widthMm: 4000, heightMm: 900, text: '바로바로' }), orig.id);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(async () => (await signs(page)).length).toBe(2);
  const pasted = (await signs(page))[1];
  expect(pasted.name).toBe(`${orig.name} 복사`);
  expect(pasted.widthMm).toBe(4000); expect(pasted.text).toBe('바로바로');
  expect(pasted.quad[0][0]).toBeGreaterThan(orig.quad[0][0]); expect(pasted.quad[0][1]).toBeGreaterThan(orig.quad[0][1]);
  await expect(page.getByTestId('sign-shape').and(page.locator('[data-selected]'))).toHaveCount(1); // 붙인 것이 골라진다
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(async () => (await signs(page)).length).toBe(3);
  const second = (await signs(page))[2];
  expect(second.quad[0][0]).toBeGreaterThan(pasted.quad[0][0]);
  await page.keyboard.press('ControlOrMeta+d');
  await expect.poll(async () => (await signs(page)).length).toBe(4);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await signs(page)).length).toBe(3);
});

test('사인물 설정 창의 [복제]', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('r');
  await dragOnPhoto(page, [300, 200], [700, 300]);
  await openObjectSettings(page);
  await page.getByTestId('duplicate-sign').click();
  await expect.poll(async () => (await signs(page)).length).toBe(2);
  expect((await signs(page))[1].name).toMatch(/복사$/);
});
