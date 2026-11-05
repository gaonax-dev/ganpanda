// 일러스트레이터 왕복 (2026-11-05 사용자: "대지를 다시 구성한다는건 이후에 일러스트에서 내보내고 이것을 간판다에서 연결하는 악순을 피하려는 거지" →
// "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { openOwnedProject, uploadPhoto } from './helpers';

const PT = 72 / 25.4;
/** 대지(페이지)마다 크기(pt)를 주고, xmp 가 있으면 카탈로그 /Metadata 로 넣은 최소 PDF (일러스트 PDF 호환 .ai 와 같은 모양) */
function pdfWith(pages: [number, number][], xmp?: string): Buffer {
  const objs: string[] = [];
  const n = pages.length;
  // 1 Pages, 2 Catalog, 3 Metadata, 이후 페이지·내용 쌍
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objs.push(`<< /Type /Catalog /Pages 1 0 R${xmp ? ' /Metadata 3 0 R' : ''} >>`);
  const meta = xmp ?? '';
  objs.push(`<< /Type /Metadata /Subtype /XML /Length ${Buffer.byteLength(meta, 'utf8')} >>\nstream\n${meta}\nendstream`);
  pages.forEach(([w, h], i) => {
    const c = `${i % 2 ? '0 0 1' : '1 0 0'} rg 0 0 ${w} ${h} re f`;
    objs.push(`<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  });
  let out = '%PDF-1.6\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'utf8')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'utf8');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 2 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'utf8');
}
const xmpOf = (ids: string[]) => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:ganpanda="http://ns.ganpanda.co.kr/1.0/"><ganpanda:artboards>${ids.join('|')}</ganpanda:artboards></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

async function twoSigns(page: Page) {
  await uploadPhoto(page);
  return page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    return {
      a: g.project.addObject({ photoId: pid, name: '정면 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], widthMm: 3000, heightMm: 600 }),
      b: g.project.addObject({ photoId: pid, name: '돌출', shape: 'rect', quad: [[900, 100], [1000, 100], [1000, 300], [900, 300]], sheetIds: [], widthMm: 600, heightMm: 900 }),
    };
  });
}
const designOf = (page: Page, id: string) => page.evaluate((id) => (window as any).__ganpanda.project.object(id)?.design ?? null, id);
async function upload(page: Page, name: string, buf: Buffer) {
  await page.getByTestId('view-design').click();
  await page.getByTestId('view-uv').click();
  await page.getByTestId('source-input').setInputFiles({ name, mimeType: 'application/postscript', buffer: buf });
}

test('디자인 탭 [일러스트] = 일러스트레이터 스크립트(.jsx) — 앞줄에 카드 배치(mm)·이름·id·카드 사진 데이터, 뒤에 대지 스크립트', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  // 단추는 디자인 탭 막대에 (2026-11-05 "견적탭에서 디자인으로 이동해줘") — 견적 탭에는 없다
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('export-svg')).toBeVisible();
  await expect(page.getByTestId('export-illustrator')).toHaveCount(0);
  await page.getByTestId('view-design').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('design-bar').getByTestId('export-illustrator').click();
  expect((await dl).suggestedFilename()).toMatch(/일러스트 대지\.jsx$/);
  const jsx: string = await page.evaluate(() => (window as any).__ganpanda.lastIllustrator);
  expect(jsx.startsWith('var GANPANDA_DATA = ')).toBe(true);
  const data = JSON.parse(jsx.slice('var GANPANDA_DATA = '.length, jsx.indexOf(';\n')));
  expect(data.format).toBe('ganpanda-illustrator');
  expect(data.scale).toBe(1);
  expect(data.cards.map((c: any) => [c.id, c.name, c.w, c.h])).toEqual(expect.arrayContaining([[ids.a, '정면 간판', 3000, 600], [ids.b, '돌출', 600, 900]]));
  expect(Math.min(...data.cards.map((c: any) => c.x))).toBe(0);
  expect(data.cards.some((c: any) => /^data:image\//.test(c.face ?? ''))).toBe(true); // 카드 사진
  expect(jsx).toContain('간판다로 보내기');
});

test('스크립트가 저장한 .ai(XMP 짝)를 올리면 대지가 짝지은 사인물에 자동으로 입혀진다 — 순서가 바뀌어도, 수정본은 새 디자인으로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  // 대지 순서: 돌출, 정면 간판 (일러스트에서 순서를 바꿔도 짝은 XMP 대로)
  await upload(page, '매장 대지.ai', pdfWith([[600 * PT, 900 * PT], [3000 * PT, 600 * PT]], xmpOf([ids.b, ids.a])));
  await expect.poll(() => designOf(page, ids.b), { timeout: 30_000 }).toMatchObject({ page: 0 });
  expect(await designOf(page, ids.a)).toMatchObject({ page: 1 });
  const src1 = (await designOf(page, ids.a)).sourceId;
  await expect(page.getByTestId('notice')).toContainText('대지 2개를 사인물에 자동으로 연결했습니다');
  // 수정본 다시 올리기 → 새 소스로 바뀌고 이력에 남는다
  await page.getByTestId('source-input').setInputFiles({ name: '매장 대지 v2.ai', mimeType: 'application/postscript', buffer: pdfWith([[600 * PT, 900 * PT], [3000 * PT, 600 * PT]], xmpOf([ids.b, ids.a])) });
  await expect.poll(async () => (await designOf(page, ids.a)).sourceId, { timeout: 30_000 }).not.toBe(src1);
  expect(await page.evaluate((id) => (window as any).__ganpanda.project.object(id).designHistory.length, ids.a)).toBe(2);
});

test('XMP 짝이 없는 PDF 는 대지 크기(1:10)로 짝짓되, 디자인이 이미 있는 사인물은 덮지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  await page.evaluate((a) => { const g = (window as any).__ganpanda; g.project.updateObject(a, { design: { sourceId: 'keep', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } } }); }, ids.a);
  await upload(page, '1-10.pdf', pdfWith([[300 * PT, 60 * PT], [60 * PT, 90 * PT]]));
  await expect.poll(() => designOf(page, ids.b), { timeout: 30_000 }).toMatchObject({ page: 1 });
  expect((await designOf(page, ids.a)).sourceId).toBe('keep');
  await expect(page.getByTestId('notice')).toContainText('대지 크기로 짝지음');
});
