// 소비자 견적 요청 (2026-10-21 "시작(로그인전) 사업자 소비자 구분해서 소비자는 간판견적을 보고 견적 요청하는 방식 … 도형그리기 사이즈 그리고 메모로 견적을 요청하게" → "켜는 걸로 진행")
import { expect, test } from '@playwright/test';
import { apiLogin, dragOnPhoto, openObjectSettings, openOwnedProject, uploadPhoto, openSettings } from './helpers';

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
  await expect(page.getByTestId('consumer-login-kakao')).toHaveAttribute('href', /\/api\/auth\/kakao\/start\?next=%2Festimate/, { timeout: 15_000 }); // 공급자 목록을 서버에서 받은 뒤 뜬다
  await expect(page.getByTestId('top-nav')).toBeHidden();
  const custSession = await apiLogin(request);
  await page.evaluate((s) => localStorage.setItem('ganpanda.session', s), custSession);
  await page.reload();
  await expect(page.getByTestId('consumer-gate')).toHaveCount(0);
  await expect(page.getByTestId('consumer-badge')).toContainText('참고 금액');
  // 가게 사장 화면은 청록 (2026-10-22 "소비자용 페이지와 사업자용 컬러를 차이주고 싶은데")
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#2dd4bf');
  await expect(page.getByTestId('estimate-button')).toBeDisabled(); // 사진 먼저
  await expect(page.getByTestId('proposal-button')).toHaveCount(0);
  await expect(page.getByTestId('invite-button')).toHaveCount(0);
  await expect(page.getByTestId('tool-pin')).toHaveCount(0);
  await expect(page.getByTestId('tool-zone')).toHaveCount(0);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online'); // 계정의 초안 방 — 기기 간 동기화 (2026-10-22)

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

  // 견적 요청 (2026-10-22 "대화식으로 등록증 요청 … 추출하는 효과 … 수동입력 폼이 나타나고 수집한 내용을 다시 확인 … 사업자 인증 배지")
  await page.getByTestId('estimate-button').click();
  const dlg = page.getByTestId('estimate-dialog');
  await expect(dlg).toHaveAttribute('data-step', 'who');
  await expect(dlg.getByTestId('est-chat')).toContainText('사업자등록증');
  await expect(dlg.getByTestId('est-manual')).toBeVisible(); // 하단에 수동 입력
  await expect(dlg.getByTestId('est-general')).toBeVisible();
  // 등록증 → 읽는 효과 → 읽은 내용 확인 폼 (로컬 fake: 220-81-62517 · 간판다 카페 · 홍길동 · 2020-01-05)
  await dlg.getByTestId('est-bizdoc').setInputFiles({ name: '등록증.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]) });
  await expect(dlg.getByTestId('est-scanning')).toBeVisible();
  await expect(dlg).toHaveAttribute('data-step', 'confirm', { timeout: 10_000 });
  await expect(dlg.getByTestId('est-scan')).toHaveAttribute('data-state', 'ok');
  await expect(dlg.getByTestId('est-bizno')).toHaveValue('220-81-62517');
  await expect(dlg.getByTestId('est-owner')).toHaveValue('홍길동');
  await expect(dlg.getByTestId('est-bizname')).toHaveValue('간판다 카페');
  await dlg.getByTestId('est-bizname').fill(store); // 확인하며 고친다
  await dlg.getByTestId('est-bizaddr').fill('경기도 광주시 경안로 1');
  await dlg.getByTestId('est-verify').click();
  // 인증 배지 + [변경]
  await expect(dlg.getByTestId('est-identity')).toHaveAttribute('data-kind', 'store');
  await expect(dlg.getByTestId('est-identity')).toContainText('사업자 인증');
  await expect(dlg.getByTestId('est-identity')).toContainText(store);
  await expect(dlg.getByTestId('est-identity-change')).toBeVisible();
  await expect(dlg.getByTestId('est-store')).toHaveValue(store); // 사업자 상호·주소가 채워진다
  await expect(dlg.getByTestId('est-address')).toHaveValue('경기도 광주시 경안로 1');
  await expect(dlg.getByTestId('estimate-summary')).toContainText('사진 1장 · 사인물 1개 (치수 입력 1개)');
  await expect(dlg.getByTestId('estimate-advice')).toHaveCount(0); // 다 재면 안내 없음
  // 빠진 것이 있으면 말로 알려 준다 (2026-10-22 "왜 작동안하는지 모르겠다")
  await dlg.getByTestId('estimate-send').click();
  await expect(dlg.getByTestId('estimate-missing')).toContainText('전화번호');
  await expect(dlg.getByTestId('estimate-missing')).toContainText('층'); // 층은 요청마다 한 번 (2026-10-24)
  await dlg.getByTestId('est-floor').fill('1층');
  await dlg.getByTestId('est-phone').fill(`010-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`);
  await dlg.getByTestId('est-text').fill('예산 200만 원');
  // 창을 닫았다 열어도 적던 내용·고른 사업자가 남는다
  await dlg.getByTestId('estimate-close').click();
  await page.getByTestId('estimate-button').click();
  await expect(page.getByTestId('est-identity')).toHaveAttribute('data-kind', 'store');
  await expect(page.getByTestId('est-store')).toHaveValue(store);
  // 다른 기기(같은 계정)에서도 (2026-10-22 "사업자등록기록이 다른 기기에서 연동되지 않는다")
  const dev2 = await browser.newContext();
  const p2 = await dev2.newPage();
  await p2.goto('/estimate');
  await p2.evaluate((s) => localStorage.setItem('ganpanda.session', s), custSession);
  await p2.reload();
  await expect(p2.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await p2.getByTestId('estimate-button').click();
  await expect(p2.getByTestId('est-identity')).toHaveAttribute('data-kind', 'store');
  await expect(p2.getByTestId('est-store')).toHaveValue(store);
  await expect(p2.getByTestId('est-text')).toHaveValue('예산 200만 원');
  await dev2.close();
  await dlg.getByTestId('estimate-send').click();
  const link = await dlg.getByTestId('estimate-done-link').inputValue({ timeout: 20_000 });
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{16}\?key=/);
  // 보낸 뒤 보드는 잠긴다 (2026-10-22 "견적이 요청되면 수정이 불가능하다")
  await dlg.getByTestId('estimate-close').click();
  await expect(page.getByTestId('estimate-locked')).toBeVisible();
  await expect(page.getByTestId('estimate-button')).toHaveCount(0);
  // 홈에 "내 견적 요청" → 키 없이 세션으로 요청 페이지
  await page.goto('/');
  const mine = page.getByTestId('my-request-item').filter({ hasText: store });
  await expect(mine).toBeVisible();
  await expect(mine.getByTestId('my-request-responses')).toContainText('기다리는 중');
  await mine.click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9_-]{16}$/);
  await expect(page.getByTestId('request-page')).toContainText(store);
  // 간판다로 진행하면 — 기록이 증거, 소통이 한곳에 (2026-10-24 "증거와 원활한 켜뮤니케이션을 보장하다고 알리는쪽")
  await expect(page.getByTestId('ganpanda-promise')).toContainText('기록이 증거가 됩니다');
  await expect(page.getByTestId('ganpanda-promise')).toContainText('소통이 한곳에');
  // 요청한 그대로의 보드 (2026-10-22 "그 상태를 요청페이지로 복제") — 사진을 다시 올리지 않고 서버가 복제
  const board = page.frameLocator('[data-testid="request-board"]');
  await expect(board.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  await expect(board.getByTestId('sign-shape')).toHaveCount(1);
  await expect(board.getByTestId('top-nav')).toBeHidden();

  // 간판사: 요청 받기 + 지역 → 받은 요청에 사인물 수 → 제안 만들기 → 사진과 사인물(치수)이 들어온 프로젝트
  const shopCtx = await browser.newContext();
  const shop = await shopCtx.newPage();
  await openOwnedProject(shop, request, '간판사');
  await shop.goto('/');
  await openSettings(shop);
  await shop.getByTestId('settings-tab-requests').click();
  await shop.getByTestId('req-receive').check();
  await shop.getByTestId('req-sido').selectOption('경기'); // 지역은 체크 (2026-10-24)
  await shop.locator('[data-testid="req-area"][data-region="경기 광주시"]').check();
  await shop.getByTestId('req-save').click();
  await expect(shop.getByTestId('req-saved')).toContainText('저장');
  await shop.getByTestId('close-settings').click();
  // 헤더의 "견적 요청 N" → 받은 요청 페이지 (2026-10-22 "헤더에 표시해도 될거 같아 그리고 페이지 이동해서 리스트 보이게")
  await expect(shop.getByTestId('request-list')).toHaveCount(0); // 홈에는 없다
  await expect(shop.getByTestId('request-count')).not.toHaveText('0');
  await shop.getByTestId('request-inbox-link').click();
  await expect(shop).toHaveURL(/\/requests$/);
  await expect(shop.getByTestId('request-list')).toBeVisible();
  // 제안 전엔 가게 이름·주소·내용이 가려진다 — 지역·층·사인물·크레딧만 (2026-10-24 "사진을 모두 제거하고 사이즈와 구성만 … 층 그리고 지역 만")
  await expect(shop.getByTestId('request-item').filter({ hasText: store })).toHaveCount(0);
  const item = shop.getByTestId('request-item').filter({ hasText: '경기 광주시 1층' }).first();
  await expect(item).toBeVisible();
  await expect(item.getByTestId('request-floor')).toHaveText('1층');
  await expect(item.getByTestId('request-fee')).toContainText('크레딧');
  // 목록은 이름·사인물 정보만, 단추는 [견적 넣기] 하나 (2026-10-22 "리스트는 이름 사인물 정보만 표시하고 클릭하면 복제된 페이지 바로보이게 … 견적넣기 버튼만")
  await expect(item.getByTestId('request-signs')).toContainText('사인물 1개 · 치수 1개');
  await expect(item.getByTestId('request-signs')).toContainText('4,000×700');
  await expect(item.getByTestId('request-biz')).toContainText('확인');
  await expect(item.locator('img')).toHaveCount(0);
  // 카드 단추는 파란 [실측 보기] 하나 — 가져오기는 요청 보드에서 (2026-10-22 "내 견적보기 -> 실측보기(강조색 파란색) 수정안됨 프로젝트 창에서 내프로젝트로 가져오기로 복제하기")
  await expect(item.getByTestId('request-respond')).toHaveCount(0);
  await expect(item.getByTestId('request-view')).toHaveText('실측 보기');
  await expect(item.getByTestId('request-need')).toHaveCount(0); // 요청 내용도 제안 뒤 (전화번호가 적혀 있을 수 있다)
  expect(await item.getByTestId('request-view').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(59, 130, 246)');
  expect(await shop.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#ffcc00'); // 간판집은 노랑
  // 누르면 요청 그대로의 보드(읽기 전용) + 요청 정보 줄 + [견적 넣기]
  await item.getByTestId('request-view').click();
  await expect(shop.getByTestId('request-bar')).toBeVisible({ timeout: 15_000 });
  await expect(shop.getByTestId('request-respond')).toHaveText('내 프로젝트로 가져오기');
  await expect(shop.getByTestId('request-bar')).toContainText('1층');
  await expect(shop.getByTestId('request-lock-note')).toContainText('제안을 보내면');
  // 사진은 결제 전에도 원본 (2026-10-24 "원본 그대로") — 견적 요청서 = 사인물 리스트 뷰, 금액 없음
  await expect(shop.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  await shop.getByTestId('request-sheet-toggle').click();
  await expect(shop.getByTestId('list-card')).toHaveCount(1);
  await expect(shop.getByTestId('list-card').locator('.price')).toHaveCount(0);
  // 견적 패널은 금액 빠진 품목 리스트 (2026-10-22 "데스크탑의 견적을 약간 개량해서 금액이 빠진 품목 리스트로")
  await expect(shop.getByTestId('quote-items-only')).toBeVisible();
  await expect(shop.getByTestId('quote-line').first()).toBeVisible();
  expect(await shop.getByTestId('quote-panel').innerText()).not.toMatch(/\d원/);
  await expect(shop.getByTestId('quote-total')).toHaveCount(0);
  await shop.setViewportSize({ width: 390, height: 800 }); // 휴대폰 아래 막대에서도
  await expect(shop.getByTestId('tab-pdf')).toBeVisible();
  for (const t of ['tab-order', 'tab-quote-sheet', 'open-quote-sheet']) await expect(shop.getByTestId(t)).toHaveCount(0);
  await expect(shop.getByTestId('quote-toggle')).toHaveText(/^품목/); // 휴대폰: [품목] (금액 없음)
  await shop.setViewportSize({ width: 1280, height: 800 }); // 주문서도 금액 — 감춤 (2026-10-22 "주문서를 누르면 가격이 나온다")
  await shop.getByTestId('request-sheet-toggle').click(); // 사진 보드로
  expect(await shop.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#3b82f6'); // 실측 보기 = 파랑
  await expect(shop.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  await expect(shop.getByTestId('sign-shape')).toHaveCount(1);
  await expect(shop.getByTestId('request-address')).toHaveCount(0);
  await expect(shop.getByTestId('request-text')).toHaveCount(0);
  await shop.getByTestId('request-respond').click();
  await expect(shop).not.toHaveURL(/request=/, { timeout: 15_000 }); // 요청 보드("…요청서")에서 내 프로젝트로 넘어갈 때까지 — 이름이 비슷해 앞 화면에서 통과하던 경쟁
  await expect(shop.getByTestId('request-bar')).toHaveCount(0);
  await expect(shop.getByTestId('project-title')).toHaveText('경기 광주시 1층 요청');
  expect(await shop.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#ffcc00'); // 가져온 내 프로젝트 = 노랑
  await expect(shop.getByTestId('request-propose')).toHaveText('가게 사장님께 제안 보내기'); // 다음 할 일: 제안 (2026-10-22)
  await expect(shop.getByTestId('photo-img')).toBeVisible({ timeout: 15_000 });
  await expect(shop.getByTestId('sign-shape')).toHaveCount(1, { timeout: 15_000 });
  await shop.getByTestId('sign-shape').first().click();
  await openObjectSettings(shop);
  await expect(shop.getByTestId('width-mm')).toHaveValue('4000');
  await expect(shop.getByTestId('height-mm')).toHaveValue('700');
  await shopCtx.close();
});

test('직접 입력으로 인증(틀리면 안내) → [변경]에서 일반 주문(불이익 안내) → 보내면 잠김 → 요청 페이지에서 취소(닫기만) → 잠금 풀려 새로 요청 (2026-10-22)', async ({ page, request }) => {
  const store = `빵집 ${Math.random().toString(36).slice(2, 7)}`;
  const session = await apiLogin(request);
  await page.goto('/');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('ganpanda.session', s); }, session);
  await page.goto('/estimate');
  await uploadPhoto(page);
  await page.getByTestId('estimate-button').click();
  const dlg = page.getByTestId('estimate-dialog');
  await dlg.getByTestId('est-manual').click();
  await expect(dlg).toHaveAttribute('data-step', 'confirm');
  await dlg.getByTestId('est-bizno').fill('2208162517');
  await dlg.getByTestId('est-owner').fill('김철수');
  await dlg.getByTestId('est-start').fill('2020-01-05');
  await dlg.getByTestId('est-verify').click();
  await expect(dlg.getByTestId('estimate-error')).toContainText('맞지 않습니다');
  await dlg.getByTestId('est-owner').fill('홍길동');
  await dlg.getByTestId('est-verify').click();
  await expect(dlg.getByTestId('est-identity')).toHaveAttribute('data-kind', 'store');
  // [변경] → 등록한 사업자 목록 + 일반 주문
  await dlg.getByTestId('est-identity-change').click();
  await expect(dlg.getByTestId('est-store-pick')).toHaveCount(1);
  await dlg.getByTestId('est-general').click();
  await expect(dlg.getByTestId('est-identity')).toHaveAttribute('data-kind', 'general');
  await expect(dlg.getByTestId('est-general-notice')).toContainText('세금계산서');
  await expect(dlg.getByTestId('estimate-advice')).toContainText('사인물이 없습니다');
  await dlg.getByTestId('est-store').fill(store);
  await dlg.getByTestId('est-address').fill('경기도 광주시 경안로 2');
  await dlg.getByTestId('est-phone').fill(`010-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}-${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}`);
  await dlg.getByTestId('est-floor').fill('1층'); // 층 필수 (2026-10-24)
  await dlg.getByTestId('estimate-send').click();
  const link = await dlg.getByTestId('estimate-done-link').inputValue({ timeout: 20_000 });
  // 요청 페이지: 일반 주문 배지·진행 단계 → 취소
  const u = new URL(link);
  await page.goto(u.pathname + u.search); // 서버의 APP_URL 은 다른 포트일 수 있다
  await expect(page.getByTestId('request-badge')).toHaveAttribute('data-kind', 'general');
  await expect(page.getByTestId('request-steps').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('request-summary')).toContainText('사진');
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('request-cancel').click();
  await expect(page.getByTestId('request-status')).toContainText('취소한 요청');
  await page.getByTestId('request-again').click();
  await expect(page).toHaveURL(/\/estimate$/);
  await expect(page.getByTestId('estimate-button')).toBeVisible({ timeout: 15_000 }); // 잠금이 풀렸다
  await expect(page.getByTestId('estimate-locked')).toHaveCount(0);
  await page.getByTestId('estimate-button').click();
  await expect(page.getByTestId('estimate-send')).toHaveText('견적 요청 보내기'); // 재요청 없음 — 그냥 새 요청 (2026-10-22 "환불 재요청 빼줘")
});
