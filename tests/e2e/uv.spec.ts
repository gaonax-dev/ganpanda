import { expect, test, type Page } from '@playwright/test';
import { apiCreateInvite, dragOnPhoto, openInvited, openObjectSettings, openOwnedProject, uploadPhoto } from './helpers';

/** 2쪽짜리 최소 PDF: 1쪽 빨간 사각형(400×200pt), 2쪽 파란 사각형(200×200pt) */
function twoPagePdf(): Buffer {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const page = (content: number, w: number, h: number) => `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${content} 0 R >>`;
  const c1 = '1 0 0 rg 0 0 400 200 re f';
  const c2 = '0 0 1 rg 0 0 200 200 re f';
  add('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'); // 1
  add('<< /Type /Catalog /Pages 1 0 R >>'); // 2
  add(page(4, 400, 200)); // 3
  add(`<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`); // 4
  add(page(6, 200, 200)); // 5
  add(`<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`); // 6
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 2 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

async function makeSign(page: Page) {
  await uploadPhoto(page);
  await page.keyboard.press('t');
  await dragOnPhoto(page, [400, 200], [800, 300]);
  await openObjectSettings(page);
  await page.getByTestId('width-mm').fill('4000');
  await page.getByTestId('height-mm').fill('1000');
  await page.keyboard.press('Escape');
}

/** UV 뷰 페이지 위에서 페이지 px 좌표로 드래그 */
async function dragOnSource(page: Page, pageIndex: number, from: [number, number], to: [number, number]) {
  const el = page.getByTestId('source-page').nth(pageIndex);
  const b = (await el.boundingBox())!;
  const w = Number(await el.getAttribute('data-w')), h = Number(await el.getAttribute('data-h'));
  const kx = b.width / w, ky = b.height / h;
  await page.mouse.move(b.x + from[0] * kx, b.y + from[1] * ky);
  await page.mouse.down();
  await page.mouse.move(b.x + to[0] * kx, b.y + to[1] * ky, { steps: 6 });
  await page.mouse.up();
}

test('.ai(PDF 호환) 파일을 올리면 아트보드마다 소스 페이지가 되고, 영역을 그려 사인물에 입힌다', async ({ page, request, browser }) => {
  const { session, projectId } = await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-design').click(); // 디자인 파일은 디자인 탭 안 (2026-10-22)
  await page.getByTestId('view-uv').click();
  await page.getByTestId('source-input').setInputFiles({ name: '간판 시안.ai', mimeType: 'application/postscript', buffer: twoPagePdf() });
  await expect(page.getByTestId('source-page')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('source-page').first()).toHaveAttribute('data-w', /\d+/);

  // 사인물 선택 → 1쪽 왼쪽 절반을 잘라 입힌다
  await page.getByTestId('uv-object').first().click();
  const w = Number(await page.getByTestId('source-page').first().getAttribute('data-w'));
  const h = Number(await page.getByTestId('source-page').first().getAttribute('data-h'));
  await dragOnSource(page, 0, [10, 10], [w / 2, h - 10]);
  await expect(page.getByTestId('crop-rect')).toHaveCount(1);
  await expect(page.getByTestId('design-history-item')).toHaveCount(1);
  // 선택 해제: 빈 곳 클릭 → 강조 상자가 사라진다. 목록을 다시 누르면 선택, 한 번 더 누르면 해제, Esc 도 해제
  await page.getByTestId('uv-canvas').click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId('crop-rect')).toHaveCount(0);
  await expect(page.getByTestId('crop-rect-other')).toHaveCount(1);
  await expect(page.getByTestId('uv-object').first()).not.toHaveClass(/on/);
  await page.getByTestId('uv-object').first().click();
  await expect(page.getByTestId('crop-rect')).toHaveCount(1);
  await page.getByTestId('uv-object').first().click();
  await expect(page.getByTestId('crop-rect')).toHaveCount(0);
  await page.getByTestId('uv-object').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('crop-rect')).toHaveCount(0);
  await page.getByTestId('uv-object').first().click();

  // 사진 위(디자인 탭 2D)와 전개도에 디자인이 보인다
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('photo-zone').getByTestId('design-image')).toHaveCount(1); // 사진 위 (보드 평면도 카드에도 한 번 더 보인다)
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('list-design')).toHaveCount(1);

  // 고객도 본다
  const guest = await openInvited(browser, await apiCreateInvite(request, session, projectId, 'viewer'));
  await expect(guest.getByTestId('photo-zone').getByTestId('design-image')).toHaveCount(1); // 보드 평면도 카드에도 한 번 더 보인다
  await guest.ctx.close();
});

test('영역을 바꾸면 히스토리가 쌓이고, 이전 것을 눌러 되돌릴 수 있다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await makeSign(page);
  await page.getByTestId('view-design').click(); // 디자인 파일은 디자인 탭 안 (2026-10-22)
  await page.getByTestId('view-uv').click();
  await page.getByTestId('source-input').setInputFiles({ name: '시안.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
  await expect(page.getByTestId('source-page')).toHaveCount(2, { timeout: 30_000 });
  await page.getByTestId('uv-object').first().click();
  const w = Number(await page.getByTestId('source-page').first().getAttribute('data-w'));
  const h = Number(await page.getByTestId('source-page').first().getAttribute('data-h'));
  await dragOnSource(page, 0, [10, 10], [w / 2, h - 10]);
  const first = await page.getByTestId('crop-rect').getAttribute('width');
  await dragOnSource(page, 1, [10, 10], [150, 150]); // 2쪽으로 바꿈
  await expect(page.getByTestId('design-history-item')).toHaveCount(2);
  await page.getByTestId('design-history-item').nth(1).click(); // 이전 것 복원
  await expect(page.getByTestId('design-history-item')).toHaveCount(3);
  await expect(page.getByTestId('crop-rect')).toHaveAttribute('width', first!);
});

test('PDF 호환이 아닌 .ai 는 안내하고, 이미지 파일은 바로 소스가 된다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.getByTestId('view-design').click(); // 디자인 파일은 디자인 탭 안 (2026-10-22)
  await page.getByTestId('view-uv').click();
  await page.getByTestId('source-input').setInputFiles({ name: '옛날.ai', mimeType: 'application/postscript', buffer: Buffer.from('%!PS-Adobe-3.0 not a pdf') });
  await expect(page.getByTestId('notice')).toContainText('PDF 호환');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 100; c.getContext('2d')!.fillStyle = '#0a0'; c.getContext('2d')!.fillRect(0, 0, 300, 100); return c.toDataURL(); });
  await page.getByTestId('source-input').setInputFiles({ name: '로고.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
  await expect(page.getByTestId('source-page')).toHaveCount(1);
  await expect(page.getByTestId('source-page').first()).toHaveAttribute('data-w', '300');
});
