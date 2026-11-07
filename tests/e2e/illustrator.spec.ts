// 일러스트레이터 왕복 (2026-11-05 사용자: "대지를 다시 구성한다는건 이후에 일러스트에서 내보내고 이것을 간판다에서 연결하는 악순을 피하려는 거지" →
// "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야")
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { openDesignSync, openOwnedProject, uploadPhoto } from './helpers';

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
/** [디자인 싱크] › 받기 (2026-11-06) — 받은 뒤 사진보드에 검토 패널 */
async function upload(page: Page, name: string, buf: Buffer, program: 'illustrator' | 'corel' = 'illustrator') {
  await openDesignSync(page, program);
  await page.getByTestId('sync-receive-input').setInputFiles({ name, mimeType: name.endsWith('.ganpanda') ? 'application/json' : 'application/postscript', buffer: buf });
  await expect(page.getByTestId('sync-review')).toBeVisible({ timeout: 30_000 });
}

test('디자인 탭 [일러스트] = 일러스트레이터 스크립트(.jsx) — 앞줄에 카드 배치(mm)·이름·id·카드 사진 데이터, 뒤에 대지 스크립트', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  // 단추는 디자인 탭 막대에 (2026-11-05 "견적탭에서 디자인으로 이동해줘") — 견적 탭에는 없다
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('export-pdf')).toBeVisible();
  await expect(page.getByTestId('export-illustrator')).toHaveCount(0);
  await openDesignSync(page, 'illustrator'); // [디자인 싱크] › 일러스트레이터 › 보내기 (2026-11-06)
  const dl = page.waitForEvent('download');
  await page.getByTestId('illustrator-download').click(); // [대지 받기 (zip)]
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/일러스트 대지\.zip$/); // 폴더째 zip (2026-11-05 "이미지들을 따로 폴더에 넣고 연결")
  const zipPath = await download.path();
  const names = execFileSync('python3', ['-c', 'import sys,zipfile; print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', zipPath!]).toString('utf8').trim().split('\n');
  const jsx: string = await page.evaluate(() => (window as any).__ganpanda.lastIllustrator);
  expect(jsx.startsWith('var GANPANDA_DATA = ')).toBe(true);
  const data = JSON.parse(jsx.slice('var GANPANDA_DATA = '.length, jsx.indexOf(';\n')));
  expect(data.format).toBe('ganpanda-illustrator');
  expect(data.scale).toBe(1);
  expect(data.cards.map((c: any) => [c.id, c.name, c.w, c.h])).toEqual(expect.arrayContaining([[ids.a, '정면 간판', 3000, 600], [ids.b, '돌출', 600, 900]]));
  expect(Math.min(...data.cards.map((c: any) => c.x))).toBe(0);
  // 카드마다 최종 이미지 한 장 = 받은 이미지 레이어 (2026-11-06 정의 "보내기는 위의 순서로 최종(3d제외) 이미지로 보낸다")
  const images = data.cards.map((c: any) => c.image);
  expect(images).toHaveLength(2);
  expect(images.every((f: string) => /^images\/[A-Za-z0-9_-]+\.png$/.test(f))).toBe(true);
  expect(names).toEqual(expect.arrayContaining(['ganpanda.jsx', 'ganpanda.json', ...images])); // 설치형 스크립트가 읽는 데이터 (2026-11-05)
  const json = JSON.parse(execFileSync('python3', ['-c', 'import sys,zipfile; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("ganpanda.json").decode("utf8"))', zipPath!]).toString('utf8'));
  expect(json).toEqual(data);
  // 설치용 스크립트 = 데이터 없는 스크립트 그대로
  const dl2 = page.waitForEvent('download');
  await page.getByTestId('illustrator-script').click();
  const script = await dl2;
  expect(script.suggestedFilename()).toBe('간판다.jsx');
  const scriptText = (await import('fs')).readFileSync((await script.path())!, 'utf8');
  expect(scriptText.startsWith('var GANPANDA_DATA')).toBe(false);
  expect(scriptText).toContain('selectDialog');
  expect(jsx).toContain('내보내기');
  expect(jsx).toContain('PDFSaveOptions'); // [내보내기] = 레이어가 살아 있는 PDF (2026-11-07)
});

test('스크립트가 저장한 .ai(XMP 짝)를 올리면 대지가 짝지은 사인물에 자동으로 입혀진다 — 순서가 바뀌어도, 수정본은 새 디자인으로', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  // 대지 순서: 돌출, 정면 간판 (일러스트에서 순서를 바꿔도 짝은 XMP 대로)
  await upload(page, '매장 대지.ai', pdfWith([[600 * PT, 900 * PT], [3000 * PT, 600 * PT]], xmpOf([ids.b, ids.a])));
  // 확정 전에는 입히지 않고 카드에 상태만 (2026-11-06 "받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로")
  await expect(page.getByTestId('sync-count-link')).toContainText('2');
  await expect(page.locator(`[data-testid="board-card"][data-id="${ids.a}"] [data-testid="card-sync"]`)).toHaveAttribute('data-status', 'link');
  expect(await designOf(page, ids.a)).toBeNull();
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('sync-review')).toHaveCount(0);
  await expect.poll(() => designOf(page, ids.b), { timeout: 30_000 }).toMatchObject({ page: 0 });
  expect(await designOf(page, ids.a)).toMatchObject({ page: 1 });
  await expect(page.locator('[data-testid="card-sync"]')).toHaveCount(0);
  const src1 = (await designOf(page, ids.a)).sourceId;
  await expect(page.getByTestId('notice')).toContainText('입힘 2');
  // 수정본 다시 받기 → 바뀜, 확정하면 새 소스로 바뀌고 이력에 남는다
  await upload(page, '매장 대지 v2.ai', pdfWith([[600 * PT, 900 * PT], [3000 * PT, 600 * PT]], xmpOf([ids.b, ids.a])));
  await expect(page.getByTestId('sync-count-update')).toContainText('2');
  await page.getByTestId('sync-confirm').click();
  await expect.poll(async () => (await designOf(page, ids.a)).sourceId, { timeout: 30_000 }).not.toBe(src1);
  expect(await page.evaluate((id) => (window as any).__ganpanda.project.object(id).designHistory.length, ids.a)).toBe(2);
});

test('XMP 짝이 없는 PDF 는 대지 크기(1:10)로 짝짓되, 디자인이 이미 있는 사인물은 덮지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  await page.evaluate((a) => { const g = (window as any).__ganpanda; g.project.updateObject(a, { design: { sourceId: 'keep', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } } }); }, ids.a);
  await upload(page, '1-10.pdf', pdfWith([[300 * PT, 60 * PT], [60 * PT, 90 * PT]]), 'corel'); // 코렐 PDF 처럼 짝 정보 없음
  await expect(page.locator('[data-testid="sync-row"][data-status="update"] [data-testid="sync-action"]')).toHaveValue('keep');
  await page.getByTestId('sync-confirm').click();
  await expect.poll(() => designOf(page, ids.b), { timeout: 30_000 }).toMatchObject({ page: 1 });
  expect((await designOf(page, ids.a)).sourceId).toBe('keep');
});

test('일러스트 묶음(.ganpanda, 2026-11-06 정의): 디자인 = 대지 이미지로 사인물 카드에 바로, path = 사용자가 고른 구성물(채널·스카시)의 입체 · 최종 이미지·카드 표시', async ({ page, request }) => {
  // "가져오기는 대지를 기준으로 디자인과 path를 가져오는데 디자인은 대지 이름별로 이미지로 변환해 사인물 카드에 바로 적용한다. path는 대지 이름을 통해 사인물을 찾고 해당 구성물의 path에 사용자가 연결한다"
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const id = await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    return g.project.addObject({ photoId: pid, name: '채널 간판', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 600,
      parts: [{ id: 'ch1', kind: 'channel', type: 'ch-front', items: [{ id: 't1', kind: 'text', text: '카페', x: 0, y: 0, h: 400 }] }, { id: 'sc1', kind: 'scashi', type: '', items: [] }] });
  });
  // 빨간 디자인(PNG) — 브라우저 캔버스로
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 30; c.height = 6; const x = c.getContext('2d')!; x.fillStyle = '#ff0000'; x.fillRect(0, 0, 30, 6); return c.toDataURL('image/png').split(',')[1]; });
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850.39 170.08"><rect x="100" y="40" width="300" height="90" fill="#f00"/></svg>').toString('base64');
  const bundle = JSON.stringify({ format: 'ganpanda-illustrator-bundle', version: 2, items: [{ sign: id, part: 'design', kind: 'png', data: png }, { sign: id, part: 'path', kind: 'svg', data: svg }] });
  await upload(page, '매장.ganpanda', Buffer.from(bundle));
  await expect(page.locator(`[data-testid="sync-row"][data-sign="${id}"]`)).toHaveAttribute('data-status', 'link');
  // path 는 구성물이 둘(채널·스카시)이라 사용자가 고른다 — 고르기 전에는 안 넣음
  const sel = page.locator(`[data-testid="sync-path-row"][data-sign="${id}"] [data-testid="sync-path"]`);
  await expect(sel).toHaveValue('');
  await expect(sel.locator('option')).toHaveCount(3);
  await sel.selectOption('ch1');
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('notice')).toContainText('입힘 1', { timeout: 20_000 });
  const o = await page.evaluate((id) => (window as any).__ganpanda.project.object(id), id);
  expect(o.design).toMatchObject({ page: 0, crop: { x: 0, y: 0, w: 30, h: 6 } });
  const ch = o.parts.find((p: any) => p.id === 'ch1');
  expect(ch.items).toHaveLength(1);
  expect(ch.items[0]).toMatchObject({ kind: 'image', vector: true, x: 0, y: 0, w: 3000, h: 600 });
  expect(o.parts.find((p: any) => p.id === 'sc1').items).toHaveLength(0);
  // 3D 사양: 채널의 path 는 입체(vectorId)
  const li = await page.evaluate(async (id) => {
    const rp = '/src/lib/core/render.ts'; const { renderSpecOf } = await import(/* @vite-ignore */ rp);
    const o = (window as any).__ganpanda.project.object(id);
    return renderSpecOf(o, { cx: 1500, cy: 300, w: 3000, h: 600 })?.letterItems ?? [];
  }, id);
  expect(li).toEqual([expect.objectContaining({ partId: 'ch1', vectorId: ch.items[0].id })]);
  const vec = await page.evaluate(async (id) => {
    const ip = '/src/lib/render/itemImages.ts'; const { loadItemVectors } = await import(/* @vite-ignore */ ip);
    const g = (window as any).__ganpanda; const o = g.project.object(id);
    const v = await loadItemVectors(o, g.sources);
    const shapes = Object.values(v)[0] as any[];
    const xs = shapes?.[0]?.getPoints(4).map((p: any) => p.x) ?? [];
    return { n: shapes?.length ?? 0, minX: Math.min(...xs), maxX: Math.max(...xs) };
  }, id);
  expect(vec.n).toBe(1);
  expect(vec.minX).toBeCloseTo((100 / 850.39) * 3000 - 1500, 0);
  expect(vec.maxX).toBeCloseTo((400 / 850.39) * 3000 - 1500, 0);
  // 카드 표시 (2026-11-06 "사인물카드는 실측(사진), 2d(속성내용), 3d(속성내용 3d추가), 디자인(대지 이미지)")
  const card = page.locator(`[data-testid="board-card"][data-id="${id}"]`);
  await page.getByTestId('view-design').click(); // 디자인 탭 = 3D 단계 — 3D 렌더링 그림이 생기면 그것, 그전엔 대지 이미지 (2026-11-07)
  await expect(card.getByTestId('design-image')).toHaveCount(1);
  await expect(card.getByTestId('parts-overlay')).toHaveCount(0);
  await page.getByTestId('stage-2d').click();
  await expect(card.getByTestId('design-image')).toHaveCount(0);
  await expect(card.locator('[data-testid="parts-overlay"] image')).toHaveCount(1);
  await page.getByTestId('view-board').click(); // 실측
  await expect(card.getByTestId('design-image')).toHaveCount(0);
  await expect(card.getByTestId('parts-overlay')).toHaveCount(0);
  // 보내기 최종 이미지 = 디자인(빨강)
  const px = await page.evaluate(async (id) => {
    const mp = '/src/lib/render/cardImage.ts'; const { cardFinalPng } = await import(/* @vite-ignore */ mp);
    const o = (window as any).__ganpanda.project.object(id);
    const b: Blob = await cardFinalPng(o, 3000, 600, 300);
    const img = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return [img.width, img.height, ...x.getImageData(150, 30, 1, 1).data];
  }, id);
  expect(px.slice(0, 5)).toEqual([300, 60, 255, 0, 0]);
});

test('보내기 최종 이미지: 디자인이 없으면 2D 속성 내용(사진 위 바탕색), 아무것도 없으면 사진 (2026-11-06 "보내기는 위의 순서로 최종(3d제외) 이미지로 보낸다")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await uploadPhoto(page);
  const ids = await page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    return {
      fill: g.project.addObject({ photoId: pid, name: '바탕', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-flex', widthMm: 3000, heightMm: 600, options: { faceColor: '#0000ff' } }),
      none: g.project.addObject({ photoId: '', name: '빈', shape: 'rect', quad: [], sheetIds: [], widthMm: 600, heightMm: 600 }),
    };
  });
  const out = await page.evaluate(async (ids) => {
    const mp = '/src/lib/render/cardImage.ts'; const { cardFinalPng } = await import(/* @vite-ignore */ mp);
    const rp = '/src/lib/core/render.ts'; const { bodyLook } = await import(/* @vite-ignore */ rp);
    const g = (window as any).__ganpanda;
    const a = g.project.object(ids.fill);
    const b: Blob | null = await cardFinalPng(a, 3000, 600, 300);
    const look = bodyLook(a);
    const img = await createImageBitmap(b!); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const none = await cardFinalPng(g.project.object(ids.none), 600, 600, 300);
    return { has: !!b, look, px: [...x.getImageData(150, 30, 1, 1).data], none };
  }, ids);
  expect(out.has).toBe(true);
  expect(out.look).toBeTruthy(); // 2D 바탕색이 있는 사인물
  // 가운데 픽셀 = 사진 위에 바탕색을 불투명도만큼 (사진 픽셀을 모르니 바탕색 쪽으로 기울었는지)
  const hex = (out.look as any).color as string;
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const dist = (p: number[]) => Math.hypot(p[0] - want[0], p[1] - want[1], p[2] - want[2]);
  expect(dist(out.px)).toBeLessThan(255 * (1 - (out.look as any).opacity) * 1.8 + 8);
  expect(out.none).toBeNull(); // 사진도 속성도 없으면 보낼 그림 없음
});

test('받기 검토: 누락(파일에 없는 사인물)·새로 생김(짝 없는 대지) 처리 — 새 대지는 새 사인물 카드로, 누락은 연결 해제 (2026-11-06 "확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  // a 에 예전 디자인 · 받은 .ai: 대지 1 = b, 대지 2 = 디자이너가 새로 만든 대지(짝 없음, 1:1 1200×400)
  await page.evaluate((a) => (window as any).__ganpanda.project.updateObject(a, { design: { sourceId: 'old', page: 0, crop: { x: 0, y: 0, w: 10, h: 10 } } }), ids.a);
  await upload(page, '매장 대지 v3.ai', pdfWith([[600 * PT, 900 * PT], [1200 * PT, 400 * PT]], xmpOf([ids.b, ''])));
  await expect(page.getByTestId('sync-count-new')).toContainText('1');
  await expect(page.getByTestId('sync-count-missing')).toContainText('1');
  await expect(page.locator(`[data-testid="board-card"][data-id="${ids.a}"] [data-testid="card-sync"]`)).toHaveAttribute('data-status', 'missing');
  const newRow = page.locator('[data-testid="sync-row"][data-status="new"]');
  await expect(newRow).toContainText('1,200×400mm');
  await expect(newRow.getByTestId('sync-action')).toHaveValue('create');
  await page.locator('[data-testid="sync-row"][data-status="missing"] [data-testid="sync-action"]').selectOption('unlink');
  const before = await page.evaluate(() => (window as any).__ganpanda.signs.length);
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('notice')).toContainText('새 사인물 1');
  await expect(page.getByTestId('notice')).toContainText('연결 해제 1');
  expect(await designOf(page, ids.a)).toBeNull();
  expect(await designOf(page, ids.b)).toMatchObject({ page: 0 });
  const made = await page.evaluate(() => { const g = (window as any).__ganpanda; return g.signs.filter((o: any) => !o.photoId).map((o: any) => ({ w: o.widthMm, h: o.heightMm, page: o.design?.page })); });
  expect(made).toEqual([{ w: 1200, h: 400, page: 1 }]);
  expect(await page.evaluate(() => (window as any).__ganpanda.signs.length)).toBe(before + 1);
});

test('대지 = "프로젝트명 #번호" — 1부터, 새로 생기면 증분, 지운 사인물 번호는 영구결번, 받을 때 번호로 사인물을 찾는다 (2026-11-06)', async ({ page, request }) => {
  // 사용자: "대지 #id로 추적하고 프로젝트명+숫자 간단하게" → "번호 규칙은 1부터 새로생기면 증분 사라지면 영구결번"
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  await page.evaluate((ids) => { const g = (window as any).__ganpanda; g.project.updateObject(ids.a, { createdAt: 1000 }); g.project.updateObject(ids.b, { createdAt: 2000 }); }, ids); // 만든 순서를 분명히 (같은 밀리초면 카드 자리 순)
  const exportData = async () => {
    await openDesignSync(page, 'illustrator');
    const before = await page.evaluate(() => (window as any).__ganpanda.lastIllustrator?.length ?? 0);
    await page.getByTestId('illustrator-download').click();
    await expect.poll(() => page.evaluate(() => (window as any).__ganpanda.lastIllustrator?.length ?? 0)).not.toBe(before);
    await page.getByTestId('design-sync-close').click();
    const jsx: string = await page.evaluate(() => (window as any).__ganpanda.lastIllustrator);
    return JSON.parse(jsx.slice('var GANPANDA_DATA = '.length, jsx.indexOf(';\n')));
  };
  const no = (id: string) => page.evaluate((id) => (window as any).__ganpanda.project.object(id)?.artNo, id);
  const d1 = await exportData();
  expect(d1.project).toBe('테스트 매장');
  expect(Object.fromEntries(d1.cards.map((c: any) => [c.id, c.no]))).toEqual({ [ids.a]: 1, [ids.b]: 2 }); // 만든 순서대로 1부터
  expect([await no(ids.a), await no(ids.b)]).toEqual([1, 2]); // 사인물에 저장
  await expect(page.locator(`[data-testid="board-card"][data-id="${ids.b}"] [data-testid="card-artno"]`)).toHaveText('#2'); // 카드에 번호
  // 2번을 지우고 새 사인물 → 3 (2 는 영구결번)
  const c = await page.evaluate((b) => { const g = (window as any).__ganpanda; g.project.removeObject(b); return g.project.addObject({ photoId: g.photos[0].id, name: '새 간판', shape: 'rect', quad: [[100, 400], [300, 400], [300, 500], [100, 500]], sheetIds: [], widthMm: 1200, heightMm: 400 }); }, ids.b);
  const d2 = await exportData();
  expect(Object.fromEntries(d2.cards.map((x: any) => [x.id, x.no]))).toEqual({ [ids.a]: 1, [c]: 3 });
  expect(await page.evaluate(() => (window as any).__ganpanda.settings.artNoLast)).toBe(3);
  // 받기: .ai 의 XMP 짝(대지 번호) → 사인물
  await upload(page, '매장 대지.ai', pdfWith([[1200 * PT, 400 * PT], [3000 * PT, 600 * PT]], xmpOf(['3', '1'])));
  await page.getByTestId('sync-confirm').click();
  await expect.poll(() => designOf(page, c), { timeout: 30_000 }).toMatchObject({ page: 0 });
  expect(await designOf(page, ids.a)).toMatchObject({ page: 1 });
});

test('받기 검토 [취소] — 아무것도 입히지 않는다', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const ids = await twoSigns(page);
  await upload(page, '매장 대지.ai', pdfWith([[600 * PT, 900 * PT], [3000 * PT, 600 * PT]], xmpOf([ids.b, ids.a])));
  await page.getByTestId('sync-cancel').click();
  await expect(page.getByTestId('sync-review')).toHaveCount(0);
  expect(await designOf(page, ids.a)).toBeNull();
  expect(await designOf(page, ids.b)).toBeNull();
});
