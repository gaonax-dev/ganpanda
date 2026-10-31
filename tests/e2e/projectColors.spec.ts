// 프로젝트 컬러 (2026-10-31): 디자인 탭 [컬러셋] → 칸(메인·배경·포인트)에 미리보기 색·제작 코드, 칸 색을 바꾸면 연결된 사인물이 모두, 컬러셋 추가 = 복제, 셋 바꾸기
import { test, expect } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { objects: { id: string; options?: Record<string, unknown> }[]; projectColors: { active: string; sets: { id: string; name: string; slots: { id: string; hex?: string; uses?: Record<string, string> }[] }[] }; project: { allPhotos(): { id: string }[]; addObject(o: unknown): string; updateObject(id: string, p: unknown): void } } };
const g = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as G).__ganpanda.projectColors)));

test('컬러셋: 메인 칸에 앰버·시트 코드 → 사인물에 연결 → 색을 바꾸면 사인물도, 컬러셋 추가(복제)·바꾸기', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.getByTestId('view-design').click();
  await page.getByTestId('colors-open').click();
  const dlg = page.getByTestId('colors-dialog');
  await expect(dlg.getByTestId('color-slot')).toHaveCount(3);
  const main = dlg.getByTestId('color-slot').first();
  await main.getByTestId('slot-hex').evaluate((e: HTMLInputElement) => { e.value = '#ffbf00'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await main.getByTestId('slot-label').fill('앰버'); await main.getByTestId('slot-label').press('Tab');
  await main.getByTestId('slot-use-sheet').fill('LX C3940'); await main.getByTestId('slot-use-sheet').press('Tab');
  let pc = await g(page);
  const slotId = pc.sets[0].slots[0].id;
  expect(pc.sets[0].slots[0]).toMatchObject({ hex: '#ffbf00', label: '앰버', uses: { sheet: 'LX C3940' } });
  // 사인물 몸통에 메인 칸 연결 (간판 속성 화면이 하는 일)
  const id = await page.evaluate(async (slot) => {
    const path = '/src/lib/core/projectColors.ts';
    const { colorPatch } = await import(/* @vite-ignore */ path);
    const a = (window as unknown as G).__ganpanda;
    return a.project.addObject({ photoId: a.project.allPhotos()[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [600, 100], [600, 300], [100, 300]], sheetIds: [], options: colorPatch('body', a.projectColors, slot, 'sheet') });
  }, slotId);
  const bodyHex = () => page.evaluate((oid) => (window as unknown as G).__ganpanda.objects.find((o) => o.id === oid)?.options?.bodyHex, id);
  expect(await bodyHex()).toBe('#ffbf00');
  await main.getByTestId('slot-hex').evaluate((e: HTMLInputElement) => { e.value = '#00aa55'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect.poll(bodyHex).toBe('#00aa55');
  // 컬러셋 추가 = 지금 셋 복제, 새 셋이 쓰인다 → 새 셋에서 메인을 바꾸면 사인물도
  page.once('dialog', (d) => void d.accept('야간 시안'));
  await dlg.getByTestId('color-set-add').click();
  await expect(dlg.getByTestId('color-set')).toHaveCount(2);
  pc = await g(page);
  expect(pc.sets[1].name).toBe('야간 시안');
  expect(pc.active).toBe(pc.sets[1].id);
  expect(pc.sets[1].slots[0]).toMatchObject({ id: slotId, hex: '#00aa55', uses: { sheet: 'LX C3940' } });
  await dlg.getByTestId('color-slot').first().getByTestId('slot-hex').evaluate((e: HTMLInputElement) => { e.value = '#3355ff'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect.poll(bodyHex).toBe('#3355ff');
  // 첫 셋으로 바꾸면 그 셋의 색
  await dlg.getByTestId('color-set').first().click();
  await expect.poll(bodyHex).toBe('#00aa55');
});
