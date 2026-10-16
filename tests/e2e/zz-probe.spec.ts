import { test } from '@playwright/test';
import { dragOnPhoto, openOwnedProject, uploadPhoto } from './helpers';
test('probe', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [500, 700], [1100, 950]);
  await page.keyboard.press('q');
  const tools = page.locator('.tools');
  const b = (await tools.boundingBox())!;
  const res = await page.evaluate(({ x, y, w }) => {
    const out: string[] = [];
    for (let dx = 0; dx < w; dx += 20) { const el = document.elementFromPoint(x + dx, y); out.push(el ? `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 20)}|${el.getAttribute('data-testid') ?? ''}` : 'null'); }
    return out;
  }, { x: b.x + 4, y: b.y + b.height / 2, w: b.width - 8 });
  console.log(JSON.stringify([...new Set(res)]));
  await page.screenshot({ path: process.env.CLAUDE_JOB_DIR + '/tmp/probe.png' });
});
