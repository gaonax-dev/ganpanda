// 간판 속성 (2026-10-31 사용자: "현재 사인물 설정이 많이 복잡해 … 3d 뷰가 최상단 · 배치버튼 · 단으로 · 요소를 클릭하면 클로즈업 · 고르기 · 글,그림,path,gltf · 색상은 프로젝트 컬러")
import { test, expect } from '@playwright/test';
import { openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { objects: { id: string; parts?: { id: string; kind: string; options?: Record<string, unknown>; items: unknown[] }[] }[]; projectColors: { sets: { slots: { id: string }[] }[] }; project: { allPhotos(): { id: string }[]; addObject(o: unknown): string }; selectObject(id: string): void } };

test('간판 속성: 3D 뷰어 · 배치 · 단(프레임 맨 아래) → 요소를 누르면 클로즈업(단 숨김, 고르기·글·그림·path·gltf), 색은 프로젝트 컬러 칸', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const id = a.project.addObject({ photoId: a.project.allPhotos()[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [700, 100], [700, 300], [100, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 800,
      parts: [{ id: 'ch1', kind: 'channel', type: 'ch-front', options: { chType: '캡' }, items: [{ id: 't1', kind: 'text', text: '카페', x: 0, y: 0, h: 400 }] }] });
    a.selectObject(id);
  });
  await openObjectSettings(page);
  const props = page.getByTestId('sign-props');
  await expect(props.getByTestId('sign-view')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  if (process.env.KIT_SHOTS) await page.getByTestId('object-settings').screenshot({ path: '/private/tmp/claude-501/-Users-eshell-dev-ganpanda/88dde551-deea-4a11-833d-78c16980eff4/scratchpad/props-overview.png' });
  // 단: 채널(프레임에 붙음) 위, 프레임 맨 아래
  await expect(props.getByTestId('sign-el')).toHaveCount(1);
  await expect(props.getByTestId('sign-el')).toContainText('카페');
  await expect(props.getByTestId('sign-el-frame')).toBeVisible();
  // 배치: 뷰어 자리에 배치 화면, 끝내면 다시 3D
  await props.getByTestId('sign-props-layout-toggle').click();
  await expect(props.getByTestId('sign-props-layout')).toBeVisible();
  await props.getByTestId('sign-props-layout-toggle').click();
  await expect(props.getByTestId('sign-view')).toBeVisible();
  // 요소 클로즈업: 단·배치 숨김, 채널은 키트 G 한 글자, 고르기·글·그림·path·gltf
  await props.getByTestId('sign-el').click();
  await expect(props).toHaveAttribute('data-mode', 'focus');
  await expect(props.getByTestId('sign-tiers')).toHaveCount(0);
  await expect(props.getByTestId('sign-props-layout-toggle')).toHaveCount(0);
  await expect(props.getByTestId('kit-preview')).toBeVisible();
  await expect(props.getByTestId('sign-items').locator('button')).toHaveCount(4);
  await props.getByTestId('sign-add-text').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as G).__ganpanda.objects[0].parts?.[0].items.length)).toBe(2);
  await props.getByTestId('sign-pick').click();
  await expect(props.getByTestId('sign-pick-opt').first()).toBeVisible();
  await props.getByTestId('sign-pick').click();
  // 색: 프로젝트 컬러가 없으면 먼저 정하기 → 칸을 고르면 그 면이 칸에 연결
  await props.getByTestId('sign-colors-setup').click();
  const dlg = page.getByTestId('colors-dialog');
  await dlg.getByTestId('color-slot').first().getByTestId('slot-hex').evaluate((e: HTMLInputElement) => { e.value = '#ffbf00'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await dlg.getByTestId('colors-close').click();
  const faceRow = props.locator('[data-testid="sign-color-row"][data-prefix="face"]');
  await faceRow.getByTestId('sign-color-slot').first().click();
  const main = await page.evaluate(() => (window as unknown as G).__ganpanda.projectColors.sets[0].slots[0].id);
  await expect.poll(() => page.evaluate(() => (window as unknown as G).__ganpanda.objects[0].parts?.[0].options)).toMatchObject({ faceSlot: main, faceHex: '#ffbf00' });
  await expect(faceRow.getByTestId('sign-color-slot').first()).toHaveClass(/on/);
  if (process.env.KIT_SHOTS) { await page.waitForTimeout(800); await page.getByTestId('object-settings').screenshot({ path: '/private/tmp/claude-501/-Users-eshell-dev-ganpanda/88dde551-deea-4a11-833d-78c16980eff4/scratchpad/props-focus.png' }); }
  // 돌아가기
  await props.getByTestId('sign-focus-back').click();
  await expect(props.getByTestId('sign-tiers')).toBeVisible();
});
