// 버전 기록·되돌리기 (2026-10-21 백업 3단계, 유료 — "사용자가 직접 이전 상태로 돌리는 것도 유료에 도입하면 어떨까?" → "그 순서대로 진행해줘")
import { expect, test } from '@playwright/test';
import { SERVER, apiSetPlan, openOwnedProject, uploadPhoto } from './helpers';

const objs = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { name: string }[] } }).__ganpanda.objects.map((o) => o.name));
const addSign = (page: import('@playwright/test').Page, name: string) => page.evaluate((name) => { const a = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda; a.project.addObject({ photoId: a.photos[0].id, name, shape: 'rect', quad: [[100, 100], [400, 100], [400, 300], [100, 300]], sheetIds: [] }); }, name);

test('무료는 버전 기록 대신 요금제 안내', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.getByTestId('versions-open').click();
  await expect(page.getByTestId('versions-dialog')).toBeVisible();
  await expect(page.getByTestId('versions-upgrade')).toContainText('베이직');
});

test('베이직: 지금 상태 저장 → 바꾼 뒤 되돌리기(안내) → 되돌리기 전으로 다시, 새 프로젝트로 꺼내기', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await apiSetPlan(request, session, 'basic');
  await uploadPhoto(page);
  await addSign(page, '첫 사인물');
  await page.waitForTimeout(800); // 서버 문서에 반영
  await page.getByTestId('versions-open').click();
  await page.getByTestId('versions-label').fill('시안 1');
  await page.getByTestId('versions-save').click();
  await expect(page.getByTestId('versions-item')).toHaveCount(1);
  await expect(page.getByTestId('versions-item').first()).toContainText('시안 1');
  await page.getByTestId('versions-close').click();
  await addSign(page, '나중 사인물');
  await page.waitForTimeout(800);
  expect((await objs(page)).sort()).toEqual(['나중 사인물', '첫 사인물']);
  await page.getByTestId('versions-open').click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('versions-item').filter({ hasText: '시안 1' }).getByTestId('versions-restore').click();
  await expect.poll(() => objs(page)).toEqual(['첫 사인물']);
  await expect(page.getByTestId('notice')).toContainText('되돌렸습니다');
  // 되돌리기 전 상태도 버전으로 남아 다시 되돌릴 수 있다
  await expect(page.getByTestId('versions-item')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('versions-item').filter({ hasText: '되돌리기 전' }).getByTestId('versions-restore').click();
  await expect.poll(async () => (await objs(page)).sort()).toEqual(['나중 사인물', '첫 사인물']);
  // 새 프로젝트로 꺼내기 → 프로젝트가 하나 늘고 열기 링크
  const count = async () => (await (await request.get(`${SERVER}/api/projects`, { headers: { authorization: `Bearer ${session}` } })).json()).projects.length as number;
  const before = await count();
  await page.getByTestId('versions-item').filter({ hasText: '시안 1' }).getByTestId('versions-copy').click();
  await expect(page.getByTestId('versions-copied')).toBeVisible();
  expect(await count()).toBe(before + 1);
});
