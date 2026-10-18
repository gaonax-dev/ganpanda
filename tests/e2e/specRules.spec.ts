import { expect, test } from '@playwright/test';
import { SERVER, openOwnedProject, uploadPhoto } from './helpers';

// 2026-10-18 V1 (docs/features/spec-vocabulary.md): 못 알아본 말의 뜻을 묻고, 고른 뜻은 개인 규칙이 되어 다음부터 바로 알아본다
test('퀵입력이 못 알아본 말에 뜻을 답하면 규칙으로 배우고, 다음 입력부터 알아본다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    app.selectObject(app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva' }));
  });
  const spec = page.getByTestId('spec-input').first();
  const phrase = `뒷광${Date.now().toString(36).slice(-4)}`; // 다른 테스트 계정과 섞이지 않게
  await spec.getByTestId('spec-text').fill(`갈바 ${phrase} 흰색`);
  await spec.getByTestId('spec-parse').click();
  const ask = spec.getByTestId('spec-ask');
  await expect(ask).toContainText(phrase);
  await expect(spec.getByTestId('spec-share')).toBeVisible(); // 뜻을 고르기 전엔 표본 보내기
  await ask.getByTestId('spec-meaning').selectOption('channel:ch-halo');
  await expect(ask.getByTestId('spec-meaning-chip')).toHaveText(/후광 채널/);
  await expect(spec.getByTestId('spec-share')).toHaveCount(0); // 뜻을 골랐으면 규칙으로 — 표본 아님
  await spec.getByTestId('spec-apply').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ganpanda: { specRules: { phrase: string }[] } }).__ganpanda.specRules.map((r) => r.phrase))).toContain(phrase);
  // 적용 결과: 후광 채널 구성 요소
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { selected: { parts?: { type: string }[] } } }).__ganpanda.selected.parts?.map((p) => p.type))).toContain('ch-halo');
  // 다음 입력부터는 바로 알아본다 (메모·묻기 없음), 서버에도 저장됐다
  await spec.getByTestId('spec-text').fill(`${phrase} 전구색`);
  await spec.getByTestId('spec-parse').click();
  await expect(spec.getByTestId('spec-item').filter({ hasText: '내 사전' })).toHaveCount(1);
  await expect(spec.getByTestId('spec-ask')).toHaveCount(0);
  await spec.getByTestId('spec-cancel').click();
  const session = await page.evaluate(() => localStorage.getItem('ganpanda.session'));
  const r = await request.get(`${SERVER}/api/me/spec-rules`, { headers: { authorization: `Bearer ${session}` } });
  expect(((await r.json()) as { rules: { phrase: string }[] }).rules.map((x) => x.phrase)).toContain(phrase);
});
