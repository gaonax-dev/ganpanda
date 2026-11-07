// PDF 하나로 왕복 (2026-11-07 사용자: "pdf를 직접 편집가능하다면 굿이 path를 따로 둘 이유가 없고 연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로 구현할 수 있겠는데" → 레이어로 고르기)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';
import { openDesignSync, openOwnedProject, uploadPhoto } from './helpers';

const utf16 = (s: string) => 'þÿ' + Buffer.from(s, 'utf16le').swap16().toString('latin1');
/** Acrobat 레이어(OC) 3개(받은 이미지 · 디자인 · 채널) + 대지 번호 XMP 의 한 페이지 PDF (일러스트 [내보내기] 모양) */
function layeredPdf(ref: string, opts: { withChannel?: boolean; channelText?: boolean } = {}): Buffer {
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:ganpanda="http://ns.ganpanda.co.kr/1.0/"><ganpanda:artboards>${ref}</ganpanda:artboards></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const ch = opts.channelText ? '/OC /MC2 BDC BT /F1 40 Tf 10 30 Td (AB) Tj ET EMC' : opts.withChannel === false ? '' : '/OC /MC2 BDC 0 0 1 rg 20 20 m 80 20 l 80 80 l 20 80 l h 40 40 m 60 40 l 60 60 l 40 60 l h f* EMC';
  const content = `/OC /MC0 BDC 1 0 0 rg 0 0 200 100 re f EMC /OC /MC1 BDC 0 0.6 0 rg 120 20 60 60 re f EMC ${ch}`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /Metadata 8 0 R /OCProperties << /OCGs [5 0 R 6 0 R 7 0 R] /D << /Order [5 0 R 6 0 R 7 0 R] /ON [5 0 R 6 0 R 7 0 R] >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Properties << /MC0 5 0 R /MC1 6 0 R /MC2 7 0 R >> /Font << /F1 9 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /OCG /Name (${utf16('받은 이미지')}) >>`, `<< /Type /OCG /Name (${utf16('디자인')}) >>`, `<< /Type /OCG /Name (${utf16('채널')}) >>`,
    `<< /Type /Metadata /Subtype /XML /Length ${Buffer.byteLength(xmp, 'utf8')} >>\nstream\n${xmp}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.6\n'; const off: number[] = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

async function sign(page: any) {
  await uploadPhoto(page);
  return page.evaluate(() => {
    const g = (window as any).__ganpanda; const pid = g.photos[0].id;
    const id = g.project.addObject({ photoId: pid, name: '정면', shape: 'rect', quad: [[200, 100], [800, 100], [800, 300], [200, 300]], sheetIds: [], productId: 'board-galva', widthMm: 3000, heightMm: 1500,
      parts: [{ id: 'ch1', kind: 'channel', type: 'ch-front', items: [{ id: 't1', kind: 'text', text: '카페', x: 0, y: 0, h: 400 }] }] });
    g.project.updateObject(id, { artNo: 1 });
    return id;
  });
}
const upload = async (page: any, buf: Buffer) => {
  await openDesignSync(page, 'illustrator');
  await page.getByTestId('sync-receive-input').setInputFiles({ name: '정면 대지.pdf', mimeType: 'application/pdf', buffer: buf });
  await expect(page.getByTestId('sync-review')).toBeVisible({ timeout: 30_000 });
};

test('PDF 레이어: 받은 이미지는 끄고 디자인 그림, "채널" 레이어 벡터는 채널 구성물로 미리 골라져 확정하면 입체', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const id = await sign(page);
  await upload(page, layeredPdf('1'));
  const row = page.locator(`[data-testid="sync-layer-row"][data-sign="${id}"]`);
  await expect(row).toHaveCount(2); // 디자인 · 채널 (받은 이미지는 빠짐)
  await expect(page.locator(`[data-testid="sync-layer-row"][data-layer="채널"] [data-testid="sync-layer"]`)).toHaveValue('ch1');
  await expect(page.locator(`[data-testid="sync-layer-row"][data-layer="디자인"] [data-testid="sync-layer"]`)).toHaveValue('');
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('notice')).toContainText('입힘 1', { timeout: 20_000 });
  const o = await page.evaluate((id) => (window as any).__ganpanda.project.object(id), id);
  expect(o.design).toBeTruthy();
  const ch = o.parts.find((p: any) => p.id === 'ch1');
  expect(ch.items).toEqual([expect.objectContaining({ kind: 'image', vector: true, x: 0, y: 0, w: 3000, h: 1500 })]);
  // 패스 색 = 원본(채널 레이어는 파랑 0 0 1 rg) — 2026-11-07 "추출한 패스의 컬러는 원본에 따르게 해야됨"
  const svgText = await page.evaluate(async (assetId) => { const ap = '/src/lib/assets.ts'; const { assetUrl } = await import(/* @vite-ignore */ ap); return (await fetch(await assetUrl(assetId))).text(); }, ch.items[0].image.assetId);
  expect(svgText).toContain('fill="#0000ff"');
  expect(svgText).not.toContain('fill="#000"');
  // 디자인 그림: 받은 이미지(빨강 전체)는 꺼져 흰 바탕, 디자인(초록)·채널(파랑)은 보인다
  const px = await page.evaluate(async (o) => {
    const g = (window as any).__ganpanda; const src = g.sources.find((s: any) => s.id === o.design.sourceId); const pg = src.pages[o.design.page];
    const ap = '/src/lib/assets.ts'; const { assetUrl } = await import(/* @vite-ignore */ ap);
    const img = await createImageBitmap(await (await fetch(await assetUrl(pg.assetId))).blob());
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const at = (fx: number, fy: number) => [...x.getImageData(Math.round(img.width * fx), Math.round(img.height * fy), 1, 1).data].slice(0, 3);
    return { bg: at(0.02, 0.05), green: at(0.75, 0.5), blue: at(0.15, 0.5) };
  }, o);
  expect(px.bg).toEqual([255, 255, 255]);
  expect(px.green[1]).toBeGreaterThan(100); expect(px.green[0]).toBeLessThan(60);
  expect(px.blue[2]).toBeGreaterThan(200); expect(px.blue[0]).toBeLessThan(60);
  // 사진보드용 = 입체로 연결한 "채널" 레이어를 뺀 그림 — 채널 자리는 흰 바탕, 디자인(초록)은 그대로. 카드는 전체 그림(o.design) 그대로
  // (2026-11-07 "입체로 추가한 경우 사진보드에서는 입체 내용을 제거한 이미지로 사인물 카드는 현재와 동일하게")
  expect(o.designBase).toBeTruthy();
  const bpx = await page.evaluate(async (o) => {
    const g = (window as any).__ganpanda; const src = g.sources.find((s: any) => s.id === o.designBase.sourceId); const pg = src.pages[0];
    const ap = '/src/lib/assets.ts'; const { assetUrl } = await import(/* @vite-ignore */ ap);
    const img = await createImageBitmap(await (await fetch(await assetUrl(pg.assetId))).blob());
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const at = (fx: number, fy: number) => [...x.getImageData(Math.round(img.width * fx), Math.round(img.height * fy), 1, 1).data].slice(0, 3);
    return { derived: src.derived, green: at(0.75, 0.5), blue: at(0.15, 0.5) };
  }, o);
  expect(bpx.derived).toBe(true);
  expect(bpx.blue).toEqual([255, 255, 255]);
  expect(bpx.green[1]).toBeGreaterThan(100);
  // 디자인 탭 = 3D (2026-11-07 "디자인은 3d를 표시하게"), 2D 사진 위는 입체 제외 그림, 디자인 파일 목록에 파생 그림은 안 보임
  await page.getByTestId('view-design').click();
  expect(await page.evaluate(() => (window as any).__ganpanda.stage)).toBe('3d');
  await page.getByTestId('stage-2d').click();
  await expect(page.getByTestId('photo-zone').getByTestId('baked-design')).toHaveAttribute('data-source', o.designBase.sourceId);
  await page.getByTestId('view-design').click();
  await page.getByTestId('design-bar').getByTestId('view-uv').click();
  await expect(page.getByTestId('page-card')).toHaveCount(1);
  await page.getByTestId('view-uv').click();
  // 3D: 채널 벡터 = 바깥 사각형 + 구멍(짝홀), 사인물 mm 로
  const vec = await page.evaluate(async (id) => {
    const ip = '/src/lib/render/itemImages.ts'; const { loadItemVectors } = await import(/* @vite-ignore */ ip);
    const g = (window as any).__ganpanda; const v = await loadItemVectors(g.project.object(id), g.sources);
    const shapes = Object.values(v)[0] as any[]; const xs = shapes[0].getPoints(4).map((p: any) => p.x);
    return { n: shapes.length, holes: shapes[0].holes.length, minX: Math.min(...xs), maxX: Math.max(...xs) };
  }, id);
  expect(vec).toMatchObject({ n: 1, holes: 1 });
  expect(vec.minX).toBeCloseTo((20 / 200) * 3000 - 1500, 0);
  expect(vec.maxX).toBeCloseTo((80 / 200) * 3000 - 1500, 0);
});

test('PDF 레이어: 윤곽선 아닌 글자만 있는 레이어는 안내, 받은 이미지 말고 아무것도 없으면 디자인을 넣지 않음', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const id = await sign(page);
  await upload(page, layeredPdf('1', { channelText: true }));
  await expect(page.locator(`[data-testid="sync-layer-row"][data-layer="채널"] [data-testid="sync-layer-text"]`)).toContainText('윤곽선');
  await page.getByTestId('sync-cancel').click();
  expect(await page.evaluate((id) => (window as any).__ganpanda.project.object(id).design ?? null, id)).toBeNull();
});

test('받다가 실패하면 알림에 단계와 오류 (2026-11-07 맥 앱 "파일을 처리하지 못했습니다" — 원인이 안 보였다)', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await sign(page);
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.addSource = () => { throw new Error('일부러 실패'); }; });
  await openDesignSync(page, 'illustrator');
  await page.getByTestId('sync-receive-input').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: layeredPdf('1') });
  await expect(page.getByTestId('notice')).toContainText('파일을 처리하지 못했습니다 (디자인 파일 등록: 일부러 실패)', { timeout: 20_000 });
});

test('맥 앱 엔진처럼 Map.getOrInsertComputed·Math.sumPrecise 가 없어도 PDF 를 받는다 (2026-11-07 "파일을 처리하지 못했습니다")', async ({ page, request }) => {
  await page.addInitScript(() => { delete (Map.prototype as any).getOrInsertComputed; delete (WeakMap.prototype as any).getOrInsertComputed; delete (Math as any).sumPrecise; });
  await openOwnedProject(page, request);
  const id = await sign(page);
  expect(await page.evaluate(() => typeof (Map.prototype as any).getOrInsertComputed)).toBe('undefined');
  await upload(page, layeredPdf('1'));
  await expect(page.locator(`[data-testid="sync-layer-row"][data-sign="${id}"]`)).toHaveCount(2);
});

test('줌아웃 합성: 다른 사인물의 그림을 못 찾아도(없는 에셋) 디자인은 사진 위에 나온다 (2026-11-07 "디자인에서 사진보드에 디자인이 안나온다")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  await page.setViewportSize({ width: 1300, height: 850 }); // 줌아웃 합성 그림이 쓰이는 크기
  const id = await sign(page);
  // 같은 사진에 그림 객체가 있는데 그 그림을 이 기기·서버 어디서도 못 찾는 사인물
  await page.evaluate(() => { const g = (window as any).__ganpanda; g.project.addObject({ photoId: g.photos[0].id, name: '돌출', shape: 'rect', quad: [[700, 400], [800, 400], [800, 500], [700, 500]], sheetIds: [], widthMm: 800, heightMm: 800,
    parts: [{ id: 's1', kind: 'sheet', type: 'sh-print', items: [{ id: 'im', kind: 'image', image: { assetId: 'ffffffffffffffffffffffffffffffff' }, x: 0, y: 0, w: 800, h: 800 }] }] }); });
  await upload(page, layeredPdf('1'));
  await page.getByTestId('sync-confirm').click();
  await page.getByTestId('view-design').click();
  await page.getByTestId('stage-2d').click(); // 합성 그림은 2D 단계 (디자인 탭은 3D — 2026-11-07)
  // 줌아웃(합성 그림) — 디자인이 들어간 합성 그림이 생긴다
  await expect(page.getByTestId('flat-overlay')).toHaveCount(1, { timeout: 15_000 });
  expect(await page.evaluate((id) => !!(window as any).__ganpanda.project.object(id).design, id)).toBe(true);
});

test('다시 받으면 지난번 레이어 연결을 미리 골라 둔다 (2026-11-07 "다시 불렀을때 이전 연결을 유지할 수 있나?")', async ({ page, request }) => {
  await openOwnedProject(page, request);
  const id = await sign(page);
  const layerSel = (name: string) => page.locator(`[data-testid="sync-layer-row"][data-layer="${name}"] [data-testid="sync-layer"]`);
  // 1번째: 이름으로 "채널" → 채널이 골라져 있지만, 입체 안 함으로 바꾸고 "디자인" 레이어를 채널로
  await upload(page, layeredPdf('1'));
  await expect(layerSel('채널')).toHaveValue('ch1');
  await layerSel('채널').selectOption('');
  await layerSel('디자인').selectOption('ch1');
  await page.getByTestId('sync-confirm').click();
  await expect(page.getByTestId('sync-review')).toHaveCount(0);
  expect(await page.evaluate((id) => (window as any).__ganpanda.project.object(id).layerLinks, id)).toEqual({ 디자인: 'ch1', 채널: '' });
  // 2번째: 지난번 고른 대로
  await upload(page, layeredPdf('1'));
  await expect(layerSel('채널')).toHaveValue('');
  await expect(layerSel('디자인')).toHaveValue('ch1');
});

test('카드는 모드마다 바뀐다: 실측 = 사진, 2D = 속성 내용, 3D = 3D 합성에서 편 사인물 자리, 디자인 = 디자인 (2026-11-07 "핀볼에서 모든 모드 확인해줘 사이물 카드가 모드 변화에 이미지 교체가 안된다")', async ({ page, request }) => {
  test.setTimeout(90_000);
  await openOwnedProject(page, request);
  const id = await sign(page);
  // 바탕 위 면 시트 + 디자인인 사인물(큰시트처럼)도 하나
  const sheetId = await page.evaluate(() => { const g = (window as any).__ganpanda; return g.project.addObject({ photoId: g.photos[0].id, name: '큰시트', shape: 'rect', quad: [[700, 350], [900, 350], [900, 550], [700, 550]], sheetIds: [], widthMm: 2100, heightMm: 2100, parts: [{ id: 'sh', kind: 'sheet', type: 'sh-cut', on: 'frame', items: [] }] }); });
  await page.evaluate(() => { const g = (window as any).__ganpanda; const o = g.signs.find((x: any) => x.name === '큰시트'); g.project.updateObject(o.id, { artNo: 2 }); });
  await upload(page, layeredPdf('1'));
  await page.getByTestId('sync-confirm').click();
  await page.evaluate((sheetId) => { const g = (window as any).__ganpanda; const o = g.project.object(g.signs.find((x: any) => x.artNo === 1).id); g.project.updateObject(sheetId, { design: o.design }); }, sheetId);
  const card = (cid: string) => page.locator(`[data-testid="board-card"][data-id="${cid}"]`);
  await page.getByTestId('view-board').click(); // 실측
  await expect(card(id).getByTestId('card-3d')).toHaveCount(0);
  await expect(card(sheetId).getByTestId('design-image')).toHaveCount(0);
  await page.getByTestId('stage-2d').click();
  await expect(card(sheetId).getByTestId('design-image')).toHaveCount(1); // 시트는 디자인을 따른다
  await expect(card(id).getByTestId('design-image')).toHaveCount(0); // 2D = 속성 내용
  await page.getByTestId('stage-3d').click();
  await expect(card(id).getByTestId('card-3d')).toHaveCount(1, { timeout: 60_000 }); // 3D 합성에서 편 그림
  await page.getByTestId('view-design').click();
  await expect(card(id).getByTestId('design-image')).toHaveCount(1);
  await expect(card(id).getByTestId('card-3d')).toHaveCount(0);
});
