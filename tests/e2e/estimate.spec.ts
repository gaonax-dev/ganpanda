// 소비자 견적 요청 (2026-10-21 "시작(로그인전) 사업자 소비자 구분해서 소비자는 간판견적을 보고 견적 요청하는 방식 … 도형그리기 사이즈 그리고 메모로 견적을 요청하게" → "켜는 걸로 진행")
import { expect, test } from '@playwright/test';
import { apiLogin, dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

test('시작 화면 분기 → 가게 사장은 /estimate 에서 사진·사각·치수로 참고 견적을 보고 요청 → 간판사 홈에 사인물째 들어와 제안', async ({ page, request, browser }) => {
  const store = `떡집 ${Math.random().toString(36).slice(2, 7)}`;
  // 시작 화면: 간판집 / 가게 사장
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('landing-shop')).toBeVisible();
  await page.getByTestId('landing-consumer').click();
  await expect(page).toHaveURL(/\/estimate$/);
  // 입구 로그인 (2026-10-21 "입구 카카오"): 카카오 단추(next=/estimate) 또는 다른 방법 — 로그인 전엔 보드가 안 열린다
  await expect(page.getByTestId('consumer-gate')).toBeVisible();
  await expect(page.getByTestId('consumer-login-kakao')).toHaveAttribute('href', /\/api\/auth\/kakao\/start\?next=%2Festimate/);
  await expect(page.getByTestId('top-nav')).toBeHidden();
  const custSession = await apiLogin(request);
  await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), custSession);
  await page.reload();
  await expect(page.getByTestId('consumer-gate')).toHaveCount(0);
  await expect(page.getByTestId('consumer-badge')).toContainText('참고 금액');
  await expect(page.getByTestId('estimate-button')).toBeDisabled(); // 사진 먼저
  await expect(page.getByTestId('proposal-button')).toHaveCount(0);
  await expect(page.getByTestId('invite-button')).toHaveCount(0);
  await expect(page.getByTestId('tool-pin')).toHaveCount(0);
  await expect(page.getByTestId('tool-zone')).toHaveCount(0);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'local');

  // 사진 → 사각 → 치수 → 리스트 뷰 참고 견적
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [300, 620], [1300, 760]);
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('700');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('quote-reference')).toContainText('참고 금액');
  await expect(page.getByTestId('quote-panel')).toContainText('후렉스'); // 종류 없이도 간판(후렉스)으로 참고 견적
  await expect(page.getByTestId('quote-panel')).not.toContainText('이익율'); // 원가·이익은 안 보임
  await page.getByTestId('view-board').click();

  // 견적 요청 (이미 로그인됨)
  await page.getByTestId('estimate-button').click();
  const dlg = page.getByTestId('estimate-dialog');
  await expect(dlg.getByTestId('estimate-summary')).toContainText('사진 1장 · 사인물 1개 (치수 입력 1개)');
  await dlg.getByTestId('est-store').fill(store);
  await dlg.getByTestId('est-address').fill('경기도 광주시 경안로 1'); // 지역은 주소에서 (경기 광주시)
  await dlg.getByTestId('est-phone').fill(`010-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`); // 같은 번호는 열린 요청 3건까지
  await expect(dlg.getByTestId('estimate-send')).toBeDisabled(); // 사본 없이는 못 보낸다 (2026-10-21 "사업자등록증 무조건")
  // 사업자등록증 사본 → 자동 읽기(로컬 fake: 220-81-62517 · 간판다 카페 · 서울 송파구 …) → 빈 칸이 채워진다, 이후 직접 고친다
  await dlg.getByTestId('est-bizdoc').setInputFiles({ name: '등록증.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]) });
  await expect(dlg.getByTestId('est-scan')).toContainText('읽었습니다');
  await expect(dlg.getByTestId('est-bizno')).toHaveValue('220-81-62517');
  await expect(dlg.getByTestId('est-store')).toHaveValue(store); // 이미 적은 칸은 두고 빈 칸만 채운다
  await expect(dlg.getByTestId('est-address')).toHaveValue('경기도 광주시 경안로 1'); // 이미 적은 주소는 두고 빈 칸만 채운다
  await dlg.getByTestId('est-text').fill('예산 200만 원');
  await dlg.getByTestId('estimate-send').click();
  const link = await dlg.getByTestId('estimate-done-link').inputValue({ timeout: 20_000 });
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{16}\?key=/);
  // 홈에 "내 견적 요청" → 키 없이 세션으로 요청 페이지
  await page.goto('/');
  const mine = page.getByTestId('my-request-item').filter({ hasText: store });
  await expect(mine).toBeVisible();
  await expect(mine.getByTestId('my-request-responses')).toContainText('기다리는 중');
  await mine.click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]{16}$/);
  await expect(page.getByTestId('request-page')).toContainText(store);

  // 간판사: 요청 받기 + 지역 → 받은 요청에 사인물 수 → 제안 만들기 → 사진과 사인물(치수)이 들어온 프로젝트
  const shopCtx = await browser.newContext();
  const shop = await shopCtx.newPage();
  await openOwnedProject(shop, request, '간판사');
  await shop.goto('/');
  await shop.getByTestId('open-settings').click();
  await shop.getByTestId('settings-tab-requests').click();
  await shop.getByTestId('req-receive').check();
  await shop.getByTestId('req-regions').fill('경기 광주시');
  await shop.getByTestId('req-save').click();
  await expect(shop.getByTestId('req-saved')).toContainText('저장');
  await shop.getByTestId('close-settings').click();
  const item = shop.getByTestId('request-item').filter({ hasText: store });
  await expect(item).toBeVisible();
  await expect(item.getByTestId('request-signs')).toContainText('사인물 1개 · 치수 1개');
  await expect(item.getByTestId('request-biz')).toContainText('확인'); // 사본에서 읽은 번호·대표자·개업일로 진위확인 → ✓ 사업자 확인
  await expect(item.getByTestId('request-address')).toContainText('경안로 1');
  await expect(item).toContainText('경기 광주시'); // 주소에서 뽑은 지역
  await expect(item.getByTestId('request-bizdoc')).toContainText('제안을 보내면 열립니다'); // 사본은 제안 뒤
  await expect(item).toContainText('예산 200만 원');
  await item.getByTestId('request-respond').click();
  await expect(shop.getByTestId('project-title')).toContainText(`${store} 요청`);
  await expect(shop.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  await expect(shop.getByTestId('sign-shape')).toHaveCount(1, { timeout: 15_000 });
  await shop.getByTestId('sign-shape').first().click();
  await openObjectSettings(shop);
  await expect(shop.getByTestId('width-mm')).toHaveValue('4000');
  await expect(shop.getByTestId('height-mm')).toHaveValue('700');
  await shopCtx.close();
});

test('사본 없이도 번호·대표자 성명·개업일자를 넣으면 보낼 수 있다 (국세청 진위확인; 로컬 fake 는 홍길동 = 일치), 틀리면 안내', async ({ page, request }) => {
  const store = `빵집 ${Math.random().toString(36).slice(2, 7)}`;
  const session = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.goto('/estimate');
  await uploadPhoto(page);
  await page.getByTestId('estimate-button').click();
  const dlg = page.getByTestId('estimate-dialog');
  await dlg.getByTestId('est-store').fill(store);
  await dlg.getByTestId('est-address').fill('경기도 광주시 경안로 2');
  await dlg.getByTestId('est-phone').fill(`010-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`);
  await expect(dlg.getByTestId('estimate-send')).toBeDisabled();
  await dlg.getByTestId('est-bizno').fill('2208162517');
  await dlg.getByTestId('est-owner').fill('김철수');
  await dlg.getByTestId('est-start').fill('2020-01-05');
  await expect(dlg.getByTestId('estimate-send')).toBeEnabled();
  await dlg.getByTestId('estimate-send').click();
  await expect(dlg.getByTestId('estimate-error')).toContainText('일치하지 않습니다');
  await dlg.getByTestId('est-owner').fill('홍길동');
  await dlg.getByTestId('estimate-send').click();
  await expect(dlg.getByTestId('estimate-done-link')).toHaveValue(/\/r\//, { timeout: 20_000 });
});
