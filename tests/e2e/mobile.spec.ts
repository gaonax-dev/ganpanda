import { expect, test } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

/** 휴대폰 폭(390px, 터치) — 핀치 확대와 축약 라벨 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** 캔버스에 터치 포인터 이벤트를 합성해 보낸다 (Playwright 터치스크린은 탭만 지원) */
async function touch(page: import('@playwright/test').Page, type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, x: number, y: number) {
  await page.evaluate(({ type, id, x, y }) => {
    const el = document.querySelector('[data-testid="board-canvas"]')!;
    const target = document.elementFromPoint(x, y) ?? el;
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, { type, id, x, y });
}

test('두 손가락을 벌리면 보드가 확대되고, 모으면 축소된다 (핀치)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const z0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  await touch(page, 'pointerdown', 1, 150, 400);
  await touch(page, 'pointerdown', 2, 250, 400);
  await touch(page, 'pointermove', 1, 100, 400);
  await touch(page, 'pointermove', 2, 300, 400); // 100 → 200 = 2배
  await touch(page, 'pointerup', 1, 100, 400);
  await touch(page, 'pointerup', 2, 300, 400);
  const z1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  expect(z1 / z0).toBeGreaterThan(1.8);
  expect(z1 / z0).toBeLessThan(2.2);
  // 모으면 축소
  await touch(page, 'pointerdown', 1, 100, 400);
  await touch(page, 'pointerdown', 2, 300, 400);
  await touch(page, 'pointermove', 1, 150, 400);
  await touch(page, 'pointermove', 2, 250, 400);
  await touch(page, 'pointerup', 1, 150, 400);
  await touch(page, 'pointerup', 2, 250, 400);
  const z2 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform.split('(')[1]));
  expect(z2).toBeLessThan(z1);
});

test('휴대폰 폭에서는 상단 바·도구·사진 머리글이 축약되어 화면을 넘치지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await expect(page.getByTestId('view-board')).toHaveText(/^\s*보드\s*$/);
  await expect(page.getByTestId('view-list')).toContainText('리스트');
  await expect(page.getByTestId('proposal-button')).toHaveText('제안');
  await expect(page.getByTestId('invite-button')).toHaveText('초대');
  // 도구 막대는 아이콘만 (라벨 숨김)
  await expect(page.getByTestId('tool-rect').locator('.lbl')).toBeHidden();
  // 사진 머리글 버튼은 아이콘만
  await expect(page.getByTestId('camera-auto')).toHaveText('📐'); // 원근 자동 매칭 (2026-10-19), 옆의 옵션은 아이콘
  await expect(page.getByTestId('camera-open').locator('svg rect')).toHaveCount(2);
  await expect(page.getByTestId('render-open')).toHaveText('🎨');
  // 접속자 칩·역할은 숨기고 프로젝트 이름은 보인다
  await expect(page.getByTestId('role-badge')).toBeHidden();
  const title = (await page.getByTestId('project-title').boundingBox())!;
  expect(title.width).toBeGreaterThan(40);
  // 가로 넘침 없음
  const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(over).toBe(false);
  // 상단 바 전체가 화면 안
  const nav = (await page.getByTestId('top-nav').boundingBox())!;
  expect(nav.x + nav.width).toBeLessThanOrEqual(391);
  // 3D 뷰 창은 화면 폭 가득
  await page.getByTestId('render-open').click();
  const dlg = (await page.getByTestId('render-dialog').boundingBox())!;
  expect(dlg.width).toBeGreaterThanOrEqual(380);
  await page.getByTestId('close-render').click();
  // 사진을 아주 작게(전체 보기보다 더) 축소하면 머리글은 이름만, 사진 위 라벨은 숨김
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 12; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 200, clientY: 400, bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('camera-open')).toBeHidden();
  await expect(page.getByTestId('photo-zone').locator('svg text').first()).toBeHidden();
  await page.evaluate(() => { const el = document.querySelector('[data-testid="board-canvas"]')!; for (let i = 0; i < 12; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 200, clientY: 400, bubbles: true, cancelable: true })); });
  await expect(page.getByTestId('camera-open')).toBeVisible();
});

test('휴대폰 폭: 사인물을 선택하면 종류 셀렉터 · [이름] [사이즈] 간단 입력 · [상세정보] 막대가 뜬다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { project: { allPhotos(): { id: string }[]; addObject(o: unknown): string } } }).__ganpanda;
    const photoId = app.project.allPhotos()[0].id;
    app.project.addObject({ photoId, name: '첫째', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [] });
    app.project.addObject({ photoId, name: '둘째', shape: 'rect', quad: [[900, 100], [1400, 100], [1400, 300], [900, 300]], sheetIds: [] });
  });
  const objs = () => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { name: string; productId?: string; sheetIds: string[]; widthMm?: number; depthMm?: number }[] } }).__ganpanda.objects);
  // 사진 머리글(이름)을 탭하면 첫 사인물이 선택되어 막대가 뜬다 — 패널은 안 뜸
  await page.getByTestId('photo-zone').locator('.name').tap();
  await expect(page.getByTestId('quick-bar')).toBeVisible();
  await expect(page.getByTestId('quick-name')).toHaveText('첫째');
  await expect(page.getByTestId('object-panel')).toHaveCount(0);
  // 종류 셀렉터는 분류(간판/스카시/시트)만 — 세부 제품은 상세정보에서. 처음 선택은 바로
  await page.getByTestId('quick-kind').selectOption('scashi');
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBe('ch-rubber');
  await expect(page.getByTestId('quick-detail')).toContainText('고무 스카시');
  // 분류가 바뀌는 선택(스카시 → 시트)은 확인을 거친다
  await page.getByTestId('quick-kind').selectOption('sheet');
  await expect(page.getByTestId('category-confirm')).toBeVisible();
  await page.getByTestId('category-confirm-cancel').click();
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBe('ch-rubber');
  await page.getByTestId('quick-kind').selectOption('sheet');
  await page.getByTestId('category-confirm-ok').click();
  await expect.poll(async () => (await objs()).find((o) => o.name === '첫째')?.productId).toBeUndefined();
  // 간판으로 돌려도 사이즈 입력 줄은 가로×세로만 (두께는 소재에, 2026-10-16 "사인물 가로세로만 표시하고 두께는 소재에 붙이는게 맞을 거 같은데")
  await page.getByTestId('quick-kind').selectOption('sign');
  await page.getByTestId('category-confirm-ok').click();
  await page.getByTestId('quick-size').click();
  await expect(page.getByTestId('quick-depth')).toHaveCount(0);
  await page.getByTestId('quick-size').click(); // 닫기
  // [이름] → 간단 입력
  await page.getByTestId('quick-name').click();
  await page.getByTestId('quick-name-input').fill('출입문 시트');
  await page.getByTestId('quick-name-input').press('Enter');
  await expect(page.getByTestId('quick-name')).toHaveText('출입문 시트');
  // [사이즈] → 가로×세로, 다음 사인물로 넘어가며 입력
  await page.getByTestId('quick-size').click();
  await page.getByTestId('quick-width').fill('3000');
  await page.getByTestId('quick-height').fill('600');
  await expect.poll(async () => (await objs()).find((o) => o.name === '출입문 시트')?.widthMm).toBe(3000);
  await expect(page.getByTestId('quick-size')).toHaveText('3,000×600');
  await page.getByTestId('quick-next').click();
  await expect(page.getByTestId('quick-name')).toHaveText('둘째');
  await page.getByTestId('quick-width').fill('2500');
  await expect.poll(async () => (await objs()).find((o) => o.name === '둘째')?.widthMm).toBe(2500);
  // [상세정보] → 전체 패널, 닫으면 다시 막대 (선택 유지)
  await page.getByTestId('quick-panel-open').click();
  await expect(page.getByTestId('object-panel')).toBeVisible();
  await page.getByTestId('object-panel-close').click();
  await expect(page.getByTestId('quick-bar')).toBeVisible();
  await expect(page.getByTestId('quick-name')).toHaveText('둘째');
  // 선택된 사인물의 꼭짓점에는 보이는 핸들보다 두 배 넓은 터치 영역이 있다
  await expect(page.getByTestId('sign-handle-hit')).toHaveCount(4);
  const [hit, vis] = await Promise.all([page.getByTestId('sign-handle-hit').first().getAttribute('r'), page.getByTestId('sign-handle').first().getAttribute('r')]);
  expect(parseFloat(hit!) / parseFloat(vis!)).toBeCloseTo(2);
});

test('창을 휴대폰 폭으로 줄였다 되돌려도 가로 스와이프(휠)는 막히고 스크롤 연쇄가 없다 (뒤로가기 방지)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  const swipeBlocked = () => page.evaluate(() => { const ev = new WheelEvent('wheel', { deltaX: -80, deltaY: 3, bubbles: true, cancelable: true }); (document.elementFromPoint(640, 400) ?? document.body).dispatchEvent(ev); return ev.defaultPrevented; });
  expect(await swipeBlocked()).toBe(true);
  const ob = await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorX, getComputedStyle(document.body).overscrollBehaviorX, getComputedStyle(document.querySelector('[role="toolbar"]')!).overscrollBehaviorX]);
  expect(ob).toEqual(['none', 'none', 'contain']);
});

test('휴대폰 리스트 뷰: 하단 탭에 견적·단가·주문·주문서·PDF, 견적 창은 접힘 → 반 → 전체 → 반 → 접힘', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({ photoId: app.photos[0].id, name: '간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600 });
  });
  await page.getByTestId('view-list').click();
  const tabs = page.getByTestId('list-tabs');
  await expect(tabs).toBeVisible();
  await expect(tabs.getByTestId('quote-toggle')).toContainText('원'); // 합계
  const panel = page.getByTestId('quote-panel');
  await expect(panel).toBeHidden(); // 처음엔 접혀 전개도가 보인다
  await tabs.getByTestId('quote-toggle').click();
  await expect(panel).toBeVisible();
  const half = (await panel.boundingBox())!.height;
  await panel.getByTestId('quote-size').click();
  await expect(panel).toHaveAttribute('data-mode', 'full');
  expect((await panel.boundingBox())!.height).toBeGreaterThan(half + 100);
  await panel.getByTestId('quote-size').click();
  await expect(panel).toHaveAttribute('data-mode', 'half');
  await tabs.getByTestId('quote-toggle').click();
  await expect(panel).toBeHidden();
  // 탭의 기능 버튼
  await tabs.getByTestId('tab-prices').click();
  await expect(page.getByTestId('close-prices')).toBeVisible();
  await page.getByTestId('close-prices').click();
  // 가로 넘침 없음
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
});

test('휴대폰 디자인 파일 화면: 하단 탭 [사인물 연결]을 누르면 연결 창이 뜨고, 사인물을 고르면 닫히며 안내가 보인다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string } } }).__ganpanda;
    app.project.addObject({ photoId: app.photos[0].id, name: '정면 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex' });
  });
  await expect(page.getByTestId('view-uv')).toHaveText('디자인');
  await page.getByTestId('view-uv').click();
  const panel = page.getByTestId('link-panel');
  await expect(panel).toBeHidden();
  await page.getByTestId('link-toggle').click();
  await expect(panel).toBeVisible();
  await panel.getByTestId('uv-object').first().click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('design-hint')).toContainText('정면 간판');
  await expect(page.getByTestId('link-toggle')).toContainText('정면 간판');
});

test('휴대폰 패널: 사양 칩이 많아져도 대화 입력칸이 보이고, 설정 창의 아래 단추(복제·삭제·닫기)가 화면 안에 있다 (2026-10-17)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600, note: '급함', depthMm: 100, options: { paintSystem: '기본색', paintCode: '흰색' }, parts: [{ id: 'c', kind: 'channel', type: 'ch-halo', options: { bodySystem: '기본색', bodyCode: '갈색', ledColor: '주백색' }, items: [] }] });
    app.selectObject(id);
  });
  // 휴대폰 (2026-10-18): 사인물을 고르면 단계 자리에 복사·붙여넣기·복제, 빠른 막대에 퀵입력, 외곽선 변 가운데 손잡이
  await expect(page.getByTestId('mobile-duplicate')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveCount(0);
  await expect(page.getByTestId('quick-bar').getByTestId('spec-text')).toBeVisible();
  await expect(page.locator('[data-testid^="edge-handle-"]')).toHaveCount(4);
  await page.getByTestId('quick-panel-open').click();
  const panel = page.getByTestId('object-panel');
  await expect(panel).toBeVisible();
  // 사양 글 확인 창까지 열어 위쪽을 길게 만든다
  await page.getByTestId('spec-text').fill('후렉스 검정 전광 3000K');
  await page.getByTestId('spec-text').press('Enter');
  await expect(page.getByTestId('spec-item')).toHaveCount(4);
  await expect(page.getByTestId('spec-apply')).toBeVisible(); // 확인 창의 단추도 (위쪽은 스크롤)
  await page.getByTestId('spec-cancel').click();
  // 대화는 말풍선 창에서 (2026-10-18): 💬 를 누르면 창이 화면 안에, 입력칸도 창 안에
  await page.getByTestId('object-chat-open').click();
  const chat = page.getByTestId('object-chat');
  await expect(chat).toBeVisible();
  const pb = (await chat.boundingBox())!;
  const input = page.getByTestId('chat-input');
  await expect(input).toBeVisible();
  const ib = (await input.boundingBox())!;
  expect(ib.y + ib.height).toBeLessThanOrEqual(pb.y + pb.height + 1); // 창 안
  expect(ib.y + ib.height).toBeLessThanOrEqual(844); // 화면 안
  await page.getByTestId('object-chat-close').click(); // 말풍선 창을 닫으면 다시 속성 패널
  await expect(panel).toBeVisible();
  // 세로 보기: 패널이 전체 화면 (2026-10-17 "상세보기는 전창으로")
  const pb2 = (await panel.boundingBox())!;
  expect(pb2.width).toBeGreaterThanOrEqual(388);
  expect(pb2.height).toBeGreaterThan(700);
  // 설정 창: 전체 화면, 아래 단추가 화면 안
  await page.getByTestId('object-settings-open').click();
  const dlgBox = (await page.getByTestId('object-settings').boundingBox())!;
  expect(dlgBox.width).toBeGreaterThanOrEqual(388);
  expect(dlgBox.height).toBeGreaterThanOrEqual(840);
  const del = page.getByTestId('delSign');
  await expect(del).toBeVisible();
  const db = (await del.boundingBox())!;
  expect(db.y + db.height).toBeLessThanOrEqual(844);
  await page.getByTestId('close-object-settings').click();
});

test('휴대폰 터치: 외곽선 띠·변 손잡이를 끌면 그 변만 꼭짓점처럼 옮겨진다 (2026-10-18)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 300], [1000, 300], [1000, 600], [200, 600]], sheetIds: [] });
    app.selectObject(id);
  });
  const quad = () => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { quad: number[][] }[] } }).__ganpanda.objects[0].quad);
  const cdp = await page.context().newCDPSession(page);
  const tp = (x: number, y: number) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  const dragTouch = async (x: number, y: number, dx: number, dy: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x, y) });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x + (dx * i) / 6, y + (dy * i) / 6) }); await page.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  };
  /** 변 i(꼭짓점 i, i+1)만 같은 만큼 움직이고 나머지 두 점은 그대로 */
  const edgeMoved = (a: number[][], b: number[][], i: number) => { const j = (i + 1) % 4; const dx = b[i][0] - a[i][0], dy = b[i][1] - a[i][1]; return Math.hypot(dx, dy) > 1 && Math.abs(b[j][0] - a[j][0] - dx) < 0.5 && Math.abs(b[j][1] - a[j][1] - dy) < 0.5 && [0, 1, 2, 3].filter((k) => k !== i && k !== j).every((k) => b[k][0] === a[k][0] && b[k][1] === a[k][1]); };
  await expect(page.getByTestId('sign-touch-outline')).toHaveCount(1);
  expect(await page.getByTestId('sign-touch-outline').evaluate((e) => [getComputedStyle(e).stroke, getComputedStyle(e).fill])).toEqual(['rgba(0, 0, 0, 0)', 'none']); // 보이지 않는 띠 (2026-10-18 캡처: 노란 띠로 보이던 문제)
  // 변 손잡이
  const q0 = await quad();
  const h = (await page.getByTestId('edge-handle-0').boundingBox())!;
  await dragTouch(h.x + h.width / 2, h.y + h.height / 2, 50, 30);
  const q1 = await quad();
  expect(edgeMoved(q0, q1, 0)).toBe(true); // 윗변만
  // 외곽선 띠 (오른쪽 변 위, 손잡이 사이 25% 지점) → 가장 가까운 변 = 오른쪽(1)
  const c1 = (await page.getByTestId('sign-handle').nth(1).boundingBox())!, c2 = (await page.getByTestId('sign-handle').nth(2).boundingBox())!;
  const px = c1.x + c1.width / 2 + (c2.x - c1.x) * 0.25, py = c1.y + c1.height / 2 + (c2.y - c1.y) * 0.25;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), [px, py])).toBe('sign-touch-outline');
  await dragTouch(px, py, -40, 20);
  const q2 = await quad();
  expect(edgeMoved(q1, q2, 1)).toBe(true);
});

test('휴대폰 상단 메뉴: 말풍선·정리·녹음 — 녹음하면 음성 메모가 카드의 🎙 수와 상세의 🎙 목록에 들어간다 (말풍선과 따로, 2026-10-18)', async ({ page, request }) => {
  // 마이크 대신 WebAudio 발진기 스트림 (헤드리스 크롬에 마이크가 없음)
  await page.addInitScript(() => {
    const md = navigator.mediaDevices ?? ((navigator as unknown as { mediaDevices: object }).mediaDevices = {} as MediaDevices);
    md.getUserMedia = async () => { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const dst = ctx.createMediaStreamDestination(); osc.connect(dst); osc.start(); return dst.stream; };
  });
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600 });
    app.selectObject(id);
  });
  const menu = page.getByTestId('mobile-edit');
  await expect(menu).toBeVisible();
  // 순서: 다중·복사·붙여넣기·복제·말풍선·정리·녹음(맨 오른쪽). 빠른 막대의 말풍선 단추는 없어졌다
  await expect(menu.locator('button')).toHaveCount(7);
  await expect(menu.locator('button').last()).toHaveAttribute('data-testid', 'mobile-record');
  await expect(page.getByTestId('quick-chat-open')).toHaveCount(0);
  await page.getByTestId('mobile-record').click();
  await expect(page.getByTestId('mobile-record')).toContainText('■');
  await page.waitForTimeout(2500); // 전체 실행 부하에서도 넉넉히 녹음되게 (짧으면 '녹음이 너무 짧습니다'로 버려진다)
  await page.getByTestId('mobile-record').click();
  await expect(page.getByTestId('mobile-record')).toContainText('녹음', { timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __ganpanda: { notice: string } }).__ganpanda.notice)).not.toMatch(/짧습니다|보내지 못했습니다|마이크/);
  const chat = page.getByTestId('object-chat');
  await expect(chat).toHaveCount(0); // 말풍선은 열리지 않는다 — 녹음은 대화와 따로
  await expect(page.locator('[data-testid="object-bubble"], [data-testid="card-bubble"]')).toHaveCount(0); // 사인물에 말풍선도 생기지 않는다 ("녹음하면 말풍선 계속 생긴다")
  await expect(page.getByTestId('card-voice').first()).toContainText('1', { timeout: 15_000 }); // 정면도 카드: 배지와 제목 사이 🎙1 (올리기 + 동기화 — 전체 실행 땐 느리다)
  await page.getByTestId('quick-panel-open').click();
  await expect(page.getByTestId('object-voices-count')).toHaveText('1');
  await page.getByTestId('object-voices-open').click();
  const voices = page.getByTestId('object-voices');
  await expect(voices).toContainText('음성 메모');
  await expect(voices.getByTestId('chat-audio')).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId('object-chat-open').click();
  await expect(chat).toBeVisible();
  await expect(chat.getByTestId('chat-bubble')).toHaveCount(0); // 대화에는 음성 메모가 없다
  // 말풍선 단추로 열고, 정리로 선택을 풀면 메뉴가 사라진다
  await page.getByTestId('object-chat-close').click();
  await page.getByTestId('object-panel-close').click();
  await page.getByTestId('mobile-chat').click();
  await expect(chat).toBeVisible();
  await page.getByTestId('mobile-done').click();
  await expect(menu).toHaveCount(0);
  await expect(chat).toHaveCount(0);
});

test('휴대폰 다중 선택: 상단 [다중] 단추(복사 앞)를 켜면 말풍선·녹음이 숨고, 탭으로 더하고, 하단은 종류 셀렉터만 — 한 번에 종류 변경 (2026-10-19)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const photoId = app.photos[0].id;
    const a = app.project.addObject({ photoId, name: '첫째', shape: 'rect', quad: [[100, 100], [500, 100], [500, 300], [100, 300]], sheetIds: [], productId: 'board-galva' });
    const b = app.project.addObject({ photoId, name: '둘째', shape: 'rect', quad: [[700, 100], [1100, 100], [1100, 300], [700, 300]], sheetIds: [] });
    const c = app.project.addObject({ photoId, name: '셋째', shape: 'rect', quad: [[1300, 100], [1700, 100], [1700, 300], [1300, 300]], sheetIds: [], productId: 'board-galva' });
    app.selectObject(a);
    return [a, b, c];
  });
  const objs = () => page.evaluate(() => (window as unknown as { __ganpanda: { objects: { id: string; productId?: string; sheetIds: string[] }[] } }).__ganpanda.objects);
  const menu = page.getByTestId('mobile-edit');
  // [다중] 은 복사 바로 앞
  await expect(menu.locator('button').first()).toHaveAttribute('data-testid', 'mobile-multi');
  await expect(menu.locator('button').nth(1)).toHaveAttribute('data-testid', 'mobile-copy');
  // 단추가 하나 늘어도 상단 바가 화면 폭(390)을 넘지 않는다 — 녹음 단추까지 화면 안
  expect((await page.getByTestId('mobile-record').boundingBox())!.x + (await page.getByTestId('mobile-record').boundingBox())!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId('mobile-multi').tap();
  await expect(page.getByTestId('mobile-multi')).toHaveClass(/on/);
  await expect(page.getByTestId('mobile-chat')).toHaveCount(0);
  await expect(page.getByTestId('mobile-record')).toHaveCount(0);
  // 하단: 종류 셀렉터만 (이름·사이즈·상세정보·사양 글 없음)
  const bar = page.getByTestId('quick-bar');
  await expect(bar.getByTestId('quick-kind')).toBeVisible();
  await expect(bar.getByTestId('quick-name')).toHaveCount(0);
  await expect(bar.getByTestId('quick-panel-open')).toHaveCount(0);
  await expect(bar.getByTestId('quick-spec')).toHaveCount(0);
  await expect(page.getByTestId('multi-bar')).toHaveCount(0); // 데스크톱 작업 막대는 휴대폰에서 안 뜬다
  // 탭으로 더하기 (Shift 없이)
  // 사진 위 외곽선을 왼쪽부터 (그리는 순서는 선택에 따라 바뀐다)
  const boxes = (await page.locator('[data-testid="sign-shape"]').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }))).sort((a, b) => a.x - b.x);
  const tapSign = (i: number) => page.touchscreen.tap(boxes[i].x, boxes[i].y);
  await tapSign(1);
  await tapSign(2);
  await expect(page.getByTestId('quick-multi-count')).toHaveText('3개 선택');
  // 다시 탭하면 빠진다
  await tapSign(2);
  await expect(page.getByTestId('quick-multi-count')).toHaveText('2개 선택');
  await tapSign(2);
  // 종류: 섞여 있으면(간판·없음) 비어 보이고, 고르면 이미 분류가 있는 것이 있으니 확인을 거친 뒤 모두 한 번에
  await expect(bar.getByTestId('quick-kind')).toHaveValue('');
  await bar.getByTestId('quick-kind').selectOption('scashi');
  await bar.getByTestId('category-confirm-ok').tap();
  await expect.poll(async () => { const objsNow = await objs(); return ids.map((id) => objsNow.find((o) => o.id === id)?.productId); }).toEqual(['ch-rubber', 'ch-rubber', 'ch-rubber']);
  await expect(bar.getByTestId('quick-kind')).toHaveValue('scashi');
  // 한 번의 되돌리기로 모두 돌아간다
  await page.evaluate(() => (window as unknown as { __ganpanda: { undo(): void } }).__ganpanda.undo());
  await expect.poll(async () => { const objsNow = await objs(); return ids.map((id) => objsNow.find((o) => o.id === id)?.productId); }).toEqual(['board-galva', undefined, 'board-galva']);
  // 정리: 다중 선택이 끝나고 선택도 풀린다
  await page.getByTestId('mobile-done').tap();
  await expect(menu).toHaveCount(0);
  await page.evaluate((id) => (window as unknown as { __ganpanda: { selectObject(id: string): void } }).__ganpanda.selectObject(id), ids[0]);
  await expect(page.getByTestId('mobile-multi')).not.toHaveClass(/on/);
  await expect(page.getByTestId('mobile-chat')).toBeVisible();
});

test('선택한 사인물의 손잡이는 뒤에 그린 사인물보다 위 — 겹쳐도 손잡이가 눌린다 (2026-10-20 "컨트롤로들은 모든 선택영역의 최상단")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const pid = app.photos[0].id;
    const a = app.project.addObject({ photoId: pid, name: '아래', shape: 'rect', quad: [[300, 200], [700, 200], [700, 400], [300, 400]], sheetIds: [] });
    const b = app.project.addObject({ photoId: pid, name: '위', shape: 'rect', quad: [[600, 300], [1100, 300], [1100, 600], [600, 600]], sheetIds: [] }); // 나중에 그려 '아래'의 오른쪽 아래 꼭짓점을 덮는다
    app.selectObject(a);
    return [a, b];
  });
  expect(ids).toHaveLength(2);
  await expect(page.getByTestId('sign-controls')).toHaveCount(1);
  const handles = page.getByTestId('sign-controls').getByTestId('sign-handle');
  await expect(handles).toHaveCount(4);
  const top = await handles.nth(2).evaluate((el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.getAttribute('data-testid'); });
  expect(['sign-handle', 'sign-handle-hit']).toContain(top);
});

test('두 손가락이 모든 제스처보다 먼저: 손잡이를 끌던 중 두 번째 손가락이 닿으면 편집은 취소되고 화면 이동, 간격이 크게 벌어져야 확대 (2026-10-20)', async ({ page, request }) => {
  // 2026-10-20 사용자: "두손가락 드래그(화면팬)는 모든 제스처중 가장 우선한다. 그 다음 줌이다."
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const app = (window as unknown as { __ganpanda: { photos: { id: string }[]; project: { addObject(o: unknown): string }; selectObject(id: string): void } }).__ganpanda;
    const id = app.project.addObject({ photoId: app.photos[0].id, name: '띠', shape: 'rect', quad: [[300, 200], [1100, 200], [1100, 500], [300, 500]], sheetIds: [] });
    app.selectObject(id);
    return id;
  });
  const quad = () => page.evaluate((id) => (window as unknown as { __ganpanda: { objects: { id: string; quad: number[][] }[] } }).__ganpanda.objects.find((o) => o.id === id)!.quad, id);
  const q0 = await quad();
  const world = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="board-canvas"] .world')!).transform);
  const parse = (t: string) => { const m = t.match(/matrix\(([^)]+)\)/)![1].split(',').map(Number); return { zoom: m[0], x: m[4], y: m[5] }; };
  const v0 = parse(await world());
  // 첫 손가락: 오른쪽 아래 꼭짓점 손잡이를 잡고 조금 끈다(편집 시작)
  const h = (await page.getByTestId('sign-controls').getByTestId('sign-handle').nth(2).boundingBox())!;
  const fx = h.x + h.width / 2, fy = h.y + h.height / 2;
  await touch(page, 'pointerdown', 1, fx, fy);
  await touch(page, 'pointermove', 1, fx + 12, fy + 8);
  // 두 번째 손가락 → 두 손가락 화면 이동 (간격은 거의 그대로)
  await touch(page, 'pointerdown', 2, fx - 120, fy);
  for (let i = 1; i <= 8; i++) { // 손가락 둘이 번갈아 조금씩 (실제 터치처럼), 간격은 2% 정도만 흔들림
    await touch(page, 'pointermove', 1, fx + 12 + 5 * i, fy + 8 + 4 * i);
    await touch(page, 'pointermove', 2, fx - 120 + 5 * i + (i % 2 ? 2 : -2), fy + 4 * i);
  }
  await touch(page, 'pointerup', 1, fx + 52, fy + 40);
  await touch(page, 'pointerup', 2, fx - 80, fy + 32);
  const v1 = parse(await world());
  expect(v1.zoom).toBeCloseTo(v0.zoom, 5); // 간격 흔들림(2%)으로는 확대되지 않는다
  expect(v1.y - v0.y).toBeGreaterThan(20); // 화면은 이동
  expect(await quad()).toEqual(q0); // 첫 손가락 편집은 취소
  // 간격을 크게 벌리면 확대
  await touch(page, 'pointerdown', 3, 150, 600);
  await touch(page, 'pointerdown', 4, 250, 600);
  await touch(page, 'pointermove', 3, 100, 600);
  await touch(page, 'pointermove', 4, 300, 600);
  await touch(page, 'pointerup', 3, 100, 600);
  await touch(page, 'pointerup', 4, 300, 600);
  expect(parse(await world()).zoom / v1.zoom).toBeGreaterThan(1.8);
});
