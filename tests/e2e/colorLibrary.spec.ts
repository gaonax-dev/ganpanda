// 색 라이브러리 (2026-10-17 사용자: "색상관리가 중요하다. 컬러 카드 … 페인트,시트,천,필름 선택하고 컬러이름 컬러피커 공급사명 해당코드 … 라이브러리에 저장해서 꺼내쓴다. 컬러대화창에서 바로 선택")
import { expect, test, type Page } from '@playwright/test';
import { dragOnPhoto, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto } from './helpers';

const objOf = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __ganpanda: { objects: unknown[] } }).__ganpanda.objects[0])));

test('컬러 카드 만들기 → 바로 적용, 다른 필드에서 라이브러리 견본으로 재사용, 사양 글이 카드 이름을 알아봄, 새로고침 뒤에도 남음', async ({ page, request }) => {
  await openOwnedProject(page, request, '색 라이브러리');
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  const dlg = page.getByTestId('object-settings');
  await dlg.getByTestId('product-select').selectOption('board-galva');
  // 색 상자 ■ → 색 고르기 창 (2026-10-18). 태그: 입력창이자 검색창 — 기존 태그가 없으니 새 태그로
  await dlg.getByTestId('option-paint-box').click();
  const cd = page.getByTestId('color-dialog');
  await cd.getByTestId('color-kind').selectOption('시트');
  await cd.getByTestId('color-tags').fill('카페');
  await cd.getByTestId('color-tag-new').click();
  await expect(cd.getByTestId('color-tag-카페')).toBeVisible();
  await cd.getByTestId('color-name').fill('딥레드');
  await cd.getByTestId('color-hex-text').fill('#8b1a1a');
  await cd.getByTestId('color-supplier').fill('3M');
  await cd.getByTestId('color-code').fill('1080-G13');
  await cd.getByTestId('color-save').click();
  await expect(cd).toHaveCount(0);
  // 지금 필드에 스냅샷으로 적용됨
  await expect(dlg.getByTestId('option-paint-now')).toContainText('딥레드');
  await expect(dlg.getByTestId('option-paint-ref')).toHaveText('시트 · 3M · 1080-G13');
  expect((await objOf(page)).options).toMatchObject({ paintSystem: '라이브러리', paintCode: '딥레드', paintHex: '#8b1a1a', paintRef: '시트 · 3M · 1080-G13' });
  expect((await page.evaluate(() => (window as unknown as { __ganpanda: { colorLibrary: { tags?: string[] }[] } }).__ganpanda.colorLibrary[0].tags))).toEqual(['카페']);
  await expect(dlg.getByTestId('quick-body')).toContainText('딥레드');
  // 채널을 더하고 그 측면 색을 창의 라이브러리 카드로 — 검색창에 태그를 치면 바로 걸러진다
  await dlg.getByTestId('quick-add').click();
  await dlg.getByTestId('add-part-channel').click();
  await dlg.getByTestId('part-option-body-box').click();
  await cd.getByTestId('color-search').fill('카페');
  const lib = cd.locator('[data-testid^="part-option-body-lib-"]');
  await expect(lib).toHaveCount(1);
  await cd.getByTestId('color-search').fill('없는태그');
  await expect(lib).toHaveCount(0);
  await cd.getByTestId('color-search').fill('');
  await lib.first().click();
  await expect(dlg.getByTestId('part-option-body-now')).toContainText('딥레드');
  const parts = (await objOf(page)).parts as { kind: string; options: Record<string, string> }[];
  expect(parts.find((p) => p.kind === 'channel')!.options).toMatchObject({ bodySystem: '라이브러리', bodyHex: '#8b1a1a' });
  // 사양 글: 카드 이름을 알아본다 (바탕을 다른 색으로 바꿔 두고)
  await dlg.getByTestId('quick-body').click(); // 채널 탭에서 몸통 탭으로
  await dlg.getByTestId('option-paint-box').click();
  await dlg.getByTestId('option-paint-swatch-검정').click();
  await expect(dlg.getByTestId('option-paint-now')).toContainText('검정');
  await dlg.getByTestId('spec-text').fill('딥레드');
  await dlg.getByTestId('spec-parse').click();
  await expect(dlg.getByTestId('spec-confirm')).toContainText('몸통 색: 딥레드');
  await dlg.getByTestId('spec-apply').click();
  expect((await objOf(page)).options).toMatchObject({ paintSystem: '라이브러리', paintCode: '딥레드', paintHex: '#8b1a1a' });
  // 색 고르기 창: 목록에 있고, ⋯ 메뉴로 수정 — 기존 태그가 추천 목록에 뜬다 (2026-10-18)
  await dlg.getByTestId('option-paint-box').click();
  await expect(page.getByTestId('color-cards').locator('[data-name="딥레드"]')).toHaveCount(1);
  const id = await page.getByTestId('color-cards').locator('[data-name="딥레드"]').getAttribute('data-testid').then((t) => t!.replace('option-paint-lib-', ''));
  await page.getByTestId(`color-menu-${id}`).click();
  await page.getByTestId(`color-edit-${id}`).click();
  await expect(page.getByTestId('color-form')).toHaveAttribute('data-editing', id);
  await expect(page.getByTestId('color-name')).toHaveValue('딥레드');
  await page.getByTestId('color-name').fill('딥 레드');
  await page.getByTestId('color-tags').fill('카');
  await expect(page.getByTestId('color-tag-suggest-카페')).toHaveCount(0); // '카페'는 이미 골라져 있어 추천에 없고, 새 태그 단추만
  await expect(page.getByTestId('color-tag-new')).toBeVisible();
  await page.getByTestId('color-tags').fill('메탈');
  await page.getByTestId('color-tag-new').click();
  await page.getByTestId('color-save').click();
  await expect(page.getByTestId('color-cards').locator('[data-name="딥 레드"]')).toHaveCount(1);
  await expect(dlg.getByTestId('option-paint-now')).toContainText('딥 레드'); // 지금 필드가 이 카드라 스냅샷도 갱신
  // 새 색 폼의 태그 입력에 글자를 치면 기존 태그가 바로 뜬다
  await page.getByTestId('color-tags').fill('메');
  await expect(page.getByTestId('color-tag-suggest-메탈')).toBeVisible();
  await page.getByTestId('color-close').click();
  // 새로고침해도 (계정에 저장) 남는다
  await page.reload();
  await expect(page.getByTestId('photo-zone')).toBeVisible();
  const n = await page.evaluate(() => (window as unknown as { __ganpanda: { colorLibrary: { name: string }[] } }).__ganpanda.colorLibrary.length);
  expect(n).toBe(1);
  // 삭제: ⋯ 메뉴 → 삭제 (x 마크 대신)
  await page.evaluate(() => localStorage.removeItem('ganpanda.colors'));
  await page.getByTestId('sign-shape').first().click();
  await openObjectSettings(page);
  await dlg.getByTestId('option-paint-box').click();
  await page.getByTestId('color-cards').locator('[data-testid^="color-menu-"]').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('color-cards').locator('[data-testid^="color-delete-"]').first().click();
  await expect(page.getByTestId('color-cards').locator('li')).toHaveCount(0);
  await page.getByTestId('color-close').click();
  await expect(dlg.getByTestId('option-paint-now')).toContainText('딥 레드');
});
