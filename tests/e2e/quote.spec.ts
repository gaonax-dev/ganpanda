import { expect, test } from '@playwright/test';
import { apiCreateInvite, apiCreateProject, apiLogin, dragOnPhoto, openInvited, openObjectSettings, openOwnedProject, pickCategory, uploadPhoto, apiSetPlan } from './helpers';

async function makeSign(page: import('@playwright/test').Page) {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('2000');
  await page.getByTestId('height-mm').fill('1000');
  await page.getByTestId('product-select').selectOption('board-acp');
  await page.getByTestId('close-object-settings').click();
}

test('문구를 넣으면 채널 글자수가 자동으로 세어진다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('product-select').selectOption('body-none');
  // 조합형 (2026-10-16): 채널 구성 요소 + 글자 객체, 글자수는 객체마다
  await page.getByTestId('add-part-channel').click();
  await page.getByTestId('add-item-text').click();
  await page.getByTestId('item-text').fill('간판다 카페');
  await page.getByTestId('item-h').fill('600');
  await expect(page.getByTestId('item-count')).toHaveAttribute('placeholder', /5/);
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('width-mm').fill('3000');
  await expect(page.getByTestId('object-price')).toContainText('5자');
  // 몸통(갈바) + 채널 조합 → 견적 두 줄 (㎡ + 자·cm)
  await page.getByTestId('product-select').selectOption('board-galva');
  await expect(page.getByTestId('part-type')).toHaveValue('ch-front'); // 몸통을 바꿔도 구성 요소는 그대로
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await expect(page.locator('.line').filter({ hasText: '· 갈바' })).toHaveCount(1);
  await expect(page.locator('.line').filter({ hasText: '전광 채널' })).toHaveCount(1);
});

test('단가 설정에서 ㎡ 단가를 바꾸면 견적이 바뀌고, 고객은 사진 보드만 본다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('quote-auto-all').click(); // 새 프로젝트는 줄 금액 수동 입력 (2026-10-16) → 자동으로
  const before = await page.getByTestId('quote-total').textContent();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('100000');
  await page.getByTestId('price-install').fill('0');
  await page.getByTestId('price-minimum').fill('0');
  await page.getByTestId('close-prices').click();
  // 2㎡ × 100,000 = 200,000 → VAT 10% → 220,000
  await expect(page.getByTestId('quote-total')).toContainText('220,000원');
  expect(await page.getByTestId('quote-total').textContent()).not.toBe(before);

  // 2026-10-16 사용자: "고객에게 보여지는 것은 사진보드만 보인다." — 리스트·디자인 파일·금액 없음 (금액은 제안 링크에서)
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('photo-zone').first()).toBeVisible();
  for (const v of ['view-list', 'view-uv', 'quote-total', 'open-prices']) await expect(guest.getByTestId(v)).toHaveCount(0);
  await guest.evaluate(() => { const a = (window as unknown as { __ganpanda: { selectedId: string | null; signs: { id: string }[] } }).__ganpanda; a.selectedId = a.signs[0].id; });
  await expect(guest.getByTestId('object-summary')).toContainText('2,000×1,000');
  await expect(guest.getByTestId('object-summary')).not.toContainText('원'); // 사인물 요약에도 금액 없음
  await guest.ctx.close();
});

test('설치비·추가 항목·부가세 포함 표시', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('quote-auto-all').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('100000');
  await page.getByTestId('price-minimum').fill('0');
  await page.getByTestId('price-install').fill('50000');
  await page.getByTestId('close-prices').click();
  await expect(page.getByTestId('quote-install')).toContainText('50,000원');
  await page.getByTestId('extra-add').click();
  await page.getByTestId('extra-label').last().fill('소개 할인');
  await page.getByTestId('extra-amount').last().fill('-20000');
  await page.getByTestId('extra-amount').last().press('Enter');
  // 200,000 + 50,000 − 20,000 = 230,000 → 253,000
  await expect(page.getByTestId('quote-total')).toContainText('253,000원');
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-vat-included').check();
  await page.getByTestId('close-prices').click();
  await expect(page.getByTestId('quote-total')).toContainText('230,000원');
  await expect(page.getByTestId('quote-vat-note')).toContainText('포함');
});

test('내 기본 단가로 저장하면 새 프로젝트에 적용된다', async ({ page, request }) => {
  const { session } = await openOwnedProject(page, request);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('123000');
  await page.getByTestId('save-default-prices').click();
  await expect(page.getByTestId('prices-saved')).toBeVisible();
  const other = await apiCreateProject(request, session, '두 번째 매장');
  await page.goto(`/?room=${other}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'online');
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await expect(page.getByTestId('price-board-acp')).toHaveValue('123000');
});

test('견적서 인쇄 화면', async ({ page, request }) => {
  await openOwnedProject(page, request, '행복 미용실');
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-quote-sheet').click();
  await expect(page.getByTestId('quote-sheet')).toBeVisible();
  await expect(page.getByTestId('quote-sheet')).toContainText('행복 미용실');
  await expect(page.getByTestId('quote-sheet')).toContainText('알루미늄 복합판');
  await expect(page.getByTestId('quote-sheet')).toContainText('합계');
  await page.getByTestId('close-quote-sheet').click();
  await expect(page.getByTestId('quote-sheet')).toHaveCount(0);
});

test('공급 단가표(한울): 내 단가 항목을 연결하면 단가를 가져오고 꼬리표가 붙고, 직접 고치면 풀린다', async ({ page, request }) => {
  // 2026-10-16 사용자: "한울 단가표이다. 해당 단가는 한울 꼬리표가 있어야 한다… 지금은 개발중으로 둘다 구성하고 추후 업로드나 api로… 사용자가 입력가능하게"
  await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  // 공급 단가표(읽기 전용)를 펼쳐 볼 수 있다
  await page.getByTestId('supplier-toggle-hanwool').click();
  await expect(page.getByTestId('supplier-list-hanwool')).toContainText('2026-03-27');
  await expect(page.getByTestId('supplier-item').filter({ hasText: '백색시트' }).first()).toContainText('7,500원/회배');
  // 알루미늄 복합판 ㎡ 단가 ← 한울 솔벤 백색시트(예시 연결. UV 실사는 직접 출력이라 연결 목록에 없다)
  await expect(page.getByTestId('price-link-board-acp').locator('option[value="hanwool:hanwool.uv.백색시트"]')).toHaveCount(0);
  await page.getByTestId('price-link-board-acp').selectOption('hanwool:hanwool.solvent.백색시트');
  await expect(page.getByTestId('price-board-acp')).toHaveValue('7500');
  await expect(page.getByTestId('price-tag-board-acp')).toHaveText('한울');
  await page.getByTestId('close-prices').click();
  await expect(page.locator('.line').filter({ hasText: '알루미늄 복합판' })).toContainText('한울 단가');
  // 직접 입력하면 연결·꼬리표가 풀린다
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-board-acp').fill('90000');
  await expect(page.getByTestId('price-tag-board-acp')).toHaveCount(0);
  await expect(page.getByTestId('price-link-board-acp')).toHaveValue('');
  await page.getByTestId('close-prices').click();
  await expect(page.locator('.line').filter({ hasText: '알루미늄 복합판' })).not.toContainText('한울');
});

test('배수: 연결한 항목은 공급 단가 × 배수(분류 배수 우선)로 다시 계산된다', async ({ page, request }) => {
  // 2026-10-16 사용자: "한울 가격을 몇배로 할지 조정해봐" → "단가는 사용가 설정할거고"
  await openOwnedProject(page, request);
  await page.getByTestId('view-list').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-link-sh-print').selectOption('hanwool:hanwool.solvent.백색시트');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('7500');
  await page.getByTestId('markup-all').fill('2');
  await page.getByTestId('markup-all').press('Enter');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('15000');
  await page.getByTestId('supplier-toggle-hanwool').click(); // 분류 배수·직접 출력은 공급업체를 펼쳐서
  await page.getByTestId('markup-솔벤').fill('1.3');
  await page.getByTestId('markup-솔벤').press('Enter');
  await expect(page.getByTestId('price-sh-print')).toHaveValue('9800');
  await expect(page.getByTestId('price-sh-cut')).toHaveValue('35000'); // 연결 안 한 항목은 그대로
  // 직접 출력 (2026-10-16 "직접출력은 시트 후렉스 uv실사출력이고 나머지는 기존배수"): 샘플 기본은 UV·플렉스 직접 출력, 배수 칸 없음
  await expect(page.getByTestId('direct-UV')).toBeChecked();
  await expect(page.getByTestId('markup-UV')).toHaveCount(0);
  // 솔벤을 직접 출력으로 바꾸면 연결이 풀리고 단가는 남는다
  await page.getByTestId('direct-솔벤').check();
  await expect(page.getByTestId('price-tag-sh-print')).toHaveCount(0);
  await expect(page.getByTestId('price-sh-print')).toHaveValue('9800');
  // 알리다(2026-10-16 "간판제작사에 제공하는 단가"): 펼쳐 찾기, 꼬리표로 연결
  await page.getByTestId('supplier-toggle-alida').click();
  await page.getByTestId('supplier-search').fill('광확산PC 80cm');
  await expect(page.getByTestId('supplier-item').first()).toContainText('42,000원/자');
  await expect(page.getByTestId('direct-UV 후렉스 출력')).toHaveCount(0); // 찾기에 안 맞는 분류는 숨김
  // 후렉스 간판 ㎡ ← 알리다 조명용 프레임 간판(UV 주야 양면 출력 포함, 35,500원/헤베), 배수 ×2 → 71,000
  await page.getByTestId('price-link-board-flex').selectOption('alida:alida.frame.light.UV 주야모드 양면출력');
  await expect(page.getByTestId('price-board-flex')).toHaveValue('71000');
  await expect(page.getByTestId('price-tag-board-flex')).toHaveText('알리다');
});

test('공급사 계산법: 채널 단가를 알리다 글자 크기 구간 자당으로 고르면 견적이 그 계산법으로 나온다', async ({ page, request }) => {
  // 2026-10-16 사용자: "공급사별 계산법을 사용할 수 있게해줘"
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await pickCategory(page, 'sign');
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('3000');
  await page.getByTestId('height-mm').fill('600');
  await page.getByTestId('product-select').selectOption('body-none');
  await page.getByTestId('add-part-channel').click();
  await page.getByTestId('add-item-text').click();
  await page.getByTestId('item-text').fill('바로바로');
  await page.getByTestId('item-h').fill('600');
  await page.getByTestId('close-object-settings').click();
  await page.getByTestId('view-list').click();
  await page.getByTestId('quote-auto-all').click();
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-minimum').fill('0');
  await page.getByTestId('price-link-ch-front').selectOption('m:alida:letters:알미늄 캡 채널|광확산PC 채널|LED조립');
  await expect(page.getByTestId('price-ch-front')).toBeDisabled();
  await expect(page.getByTestId('price-tag-ch-front')).toHaveText('알리다');
  await page.getByTestId('close-prices').click();
  // 60cm LED조립 37,400원/자 × 4자 = 149,600 → 1,000원 반올림 150,000
  const line = page.locator('.line').filter({ hasText: '전광 채널' });
  await expect(line).toContainText('60cm');
  await expect(line).toContainText('알리다 단가');
  await expect(line.getByTestId('line-amount')).toHaveValue('150000');
  // 직접 입력으로 되돌리면 원/자·cm
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-link-ch-front').selectOption('');
  await expect(page.getByTestId('price-ch-front')).toBeEnabled();
  await page.getByTestId('close-prices').click();
  await expect(line).toContainText('원/자·cm');
});

test('견적 줄 금액: 새 프로젝트는 직접 입력, [자동]으로 계산 금액, 원가·이익율은 오너와 정산 보기 멤버만 (멤버는 손해 표시)', async ({ page, request, browser }) => {
  // 2026-10-16 사용자: "사인물 견적서는 수동으로 입력되어야한다. 수동입력후 자동전환버튼 / 해당 목록을 선택하면 구성품들과 단가연결 해당 품목 / 단가 연결이 공급사 금액"
  //  → "원가와 판매가로 이익율이 확인되어야한다. 오너와 맴버(허가시)에게만보이게 맴버의 경우 손해인 상태를 표시"
  const { session, projectId } = await openOwnedProject(page, request);
  await makeSign(page); // 알루미늄 복합판 2㎡
  await page.getByTestId('view-list').click();
  const line = page.getByTestId('quote-line').first();
  await expect(line.getByTestId('line-amount')).toHaveValue('');
  await expect(page.getByTestId('quote-needs-input')).toContainText('1건');
  // 원가: 알루미늄 복합판 단가를 한울 솔벤 백색시트(7,500원/회배)에 연결 → 2㎡ 원가 15,000
  await page.getByTestId('open-prices').click();
  await page.getByTestId('price-link-board-acp').selectOption('hanwool:hanwool.solvent.백색시트');
  await page.getByTestId('close-prices').click();
  await line.getByTestId('line-amount').fill('100000');
  await line.getByTestId('line-amount').press('Enter');
  await expect(page.getByTestId('quote-needs-input')).toHaveCount(0);
  await expect(line.getByTestId('line-margin')).toContainText('원가 15,000원');
  await expect(line.getByTestId('line-margin')).toContainText('이익율 85%');
  await expect(page.getByTestId('quote-margin')).toContainText('이익 85,000원');
  // 줄을 누르면 구성품·단가 연결·공급사 금액
  await line.getByTestId('line-open').click();
  await expect(page.getByTestId('line-parts')).toContainText('한울');
  await expect(page.getByTestId('line-parts')).toContainText('15,000원');
  // [자동] → 단가표 금액(연결 단가 7,500 × 2㎡ = 15,000)
  await line.getByTestId('line-auto').click();
  await expect(line.getByTestId('line-amount')).toHaveValue('15000');
  await expect(line.getByTestId('line-is-auto')).toBeVisible();
  // 손해: 원가보다 낮게
  await line.getByTestId('line-amount').fill('10000');
  await line.getByTestId('line-amount').press('Enter');
  await expect(line.getByTestId('line-loss')).toBeVisible();
  await expect(page.getByTestId('quote-loss')).toBeVisible();

  // 정산 보기 켠 팀 멤버(편집 초대): 이익율·손해만, 원가 금액은 안 보임
  const memberEmail = `mem-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const member = await apiLogin(request, memberEmail);
  await request.post('http://localhost:8787/api/me/team', { data: { email: memberEmail, canBilling: true }, headers: { authorization: `Bearer ${session}` } });
  await apiSetPlan(request, session, 'basic'); // 소유자 + 멤버 동시 작업 (무료는 1명)
  const inv = await apiCreateInvite(request, session, projectId, 'editor');
  const m = await openInvited(browser, inv, '멤버', member);
  await m.getByTestId('view-list').click();
  await expect(m.getByTestId('line-loss')).toBeVisible();
  await expect(m.getByTestId('line-margin')).not.toContainText('원가');
  await expect(m.getByTestId('quote-margin')).not.toContainText('원가');
  await m.ctx.close();
  // 정산 보기 없는 편집자, 고객: 이익율 없음
  const e = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'editor'), '편집자');
  await e.getByTestId('view-list').click();
  await expect(e.getByTestId('quote-line')).toHaveCount(1);
  await expect(e.getByTestId('quote-margin')).toHaveCount(0);
  await expect(e.getByTestId('line-loss')).toHaveCount(0);
  await e.ctx.close();
  const v = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(v.getByTestId('view-list')).toHaveCount(0); // 고객은 사진 보드만
  await expect(v.getByTestId('quote-margin')).toHaveCount(0);
  await v.ctx.close();
});
