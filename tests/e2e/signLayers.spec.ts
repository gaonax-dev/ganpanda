// 2026-11-10 사용자: "사인물 속성이 여기까지만 보이면 좋을 것같아.(완성풀 사진고르기도 접히고 하단이 레이어로 마치게 그리고 레이어에 [+] 마크로 추가 가능하고 레이어 상단에 빈레이어
// 그리고 해당 레이어의 아이탬을 선택하면 글로즈업하고 하단에 해당 속성만 나오게"
import { test, expect } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

type G = { __ganpanda: { objects: { id: string; parts?: { id: string; kind: string; items: { id: string; text?: string; h: number }[] }[] }[]; project: { allPhotos(): { id: string }[]; addObject(o: unknown): string }; selectObject(id: string): void } };

async function setup(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const a = (window as unknown as G).__ganpanda;
    const id = a.project.addObject({ photoId: a.project.allPhotos()[0].id, name: '간판', shape: 'rect', quad: [[100, 100], [700, 100], [700, 300], [100, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 800,
      parts: [{ id: 'ch1', kind: 'channel', type: 'ch-front', options: { chType: '캡' }, items: [{ id: 't1', kind: 'text', text: '카페', x: -600, y: 0, h: 400 }, { id: 't2', kind: 'text', text: '빵', x: 800, y: 0, h: 300 }] }] });
    a.selectObject(id);
  });
  const panel = page.getByTestId('object-panel');
  await expect(panel.getByTestId('sign-view')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return panel;
}

test('패널은 레이어로 끝난다 — 사양 글·칩은 ⚙ 세부 설정에, 완성품 고르기는 접힌 줄, 요약은 머리글 아래', async ({ page, request }) => {
  const panel = await setup(page, request);
  await expect(panel.getByTestId('spec-input')).toHaveCount(0);
  await expect(panel.getByTestId('quick-spec')).toHaveCount(0);
  await expect(panel.getByTestId('tpl-open')).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByTestId('object-summary')).toBeVisible();
  // 레이어(프레임 단)가 패널 맨 끝
  const last = await panel.locator('.info').evaluate((info) => { const f = info.querySelector('[data-testid="sign-el-frame"]')!.getBoundingClientRect(); const all = [...info.querySelectorAll('button, input, select, p')].filter((e) => (e as HTMLElement).offsetParent); return all.every((e) => e.getBoundingClientRect().top <= f.top + 1); });
  expect(last).toBe(true);
  await panel.getByTestId('object-settings-open').click();
  await expect(page.getByTestId('object-settings').getByTestId('spec-input')).toBeVisible();
});

test('레이어 [+] = 맨 위에 빈 레이어 · 객체를 고르면 그 객체만 클로즈업하고 그 속성만', async ({ page, request }) => {
  const panel = await setup(page, request);
  const props = panel.getByTestId('sign-props');
  // 객체 고르기 → 그 글자만 남고, 아래는 그 객체 속성만
  await props.getByTestId('sign-item').filter({ hasText: '빵' }).click();
  await expect(props.getByTestId('sign-item-focus')).toBeVisible();
  await expect(props.getByTestId('sign-tiers')).toHaveCount(0);
  await expect(props.getByTestId('sign-items')).toHaveCount(0); // 레이어 쪽 단추(글·그림 추가)는 안 보인다
  const view = props.getByTestId('sign-view');
  await expect(view).toHaveAttribute('data-focus-item', 't2');
  await expect(props.getByTestId('sign-item-text')).toHaveValue('빵');
  await props.getByTestId('sign-item-h').fill('350');
  await expect.poll(() => page.evaluate(() => (window as unknown as G).__ganpanda.objects[0].parts?.[0].items.find((i) => i.id === 't2')?.h)).toBe(350);
  await props.getByTestId('sign-item-back').click(); // ← 레이어
  await expect(props).toHaveAttribute('data-mode', 'focus');
  await props.getByTestId('sign-focus-back').click();
  // [+] → 종류 → 맨 위에 빈 레이어, 바로 그 레이어로
  await props.getByTestId('sign-layer-add').click();
  await props.locator('[data-testid="sign-layer-kind"][data-kind="scashi"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as G).__ganpanda.objects[0].parts?.map((p) => `${p.kind}:${p.items.length}`).join(' '))).toBe('scashi:0 channel:2');
  await expect(props).toHaveAttribute('data-mode', 'focus');
  await props.getByTestId('sign-focus-back').click();
  await expect(props.getByTestId('sign-el').first()).toContainText('빈 레이어');
});
