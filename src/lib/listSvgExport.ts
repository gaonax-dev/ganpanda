// 사인물 전개도 SVG 만들기 (견적 탭 PDF 와 디자인 탭 SVG 가 함께 씀 — 2026-11-05 견적 화면에서 떼어냄).
// 견적 탭 PDF = 금액·합계 포함, 디자인 탭 SVG(코렐·커팅 등 다른 프로그램용) = 금액·합계 없음 ("견적탭에 svg,pdf가 있을 이유가 있나?" → "진행해줘")
import { app } from './state.svelte';
import { assetUrl } from './assets';
import { listSvg, type SvgCard, type SvgSheet } from './core/listSvg';
import { describeOptions } from './core/options';
import { CHANNEL_OPTIONS, productById, sheetById, signParts } from './core/catalog';
import { quoteObject, won } from './core/quote';
import { layoutParts } from './core/partsLayout';
import { imageDataUrl } from './core/imageData';
import { itemAssetId } from './render/itemImages';

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** 치수 있는 카드(임시 크기 제외)로 전개도 SVG. amounts = 카드 금액·합계를 넣을지 */
export async function buildListSvg(opts: Partial<SvgSheet> = {}, { amounts }: { amounts: boolean }): Promise<string> {
  // 그림은 그림 MIME 의 data URL 로만 묻는다. 못 만들면(받기 실패·그림 아님) 빼고 알린다 — 외부 주소를 남기면 일러스트레이터가 "연결 파일 누락"이라 한다 (2026-10-18)
  let skipped = 0;
  const toDataUrl = async (u: string): Promise<string | undefined> => { try { const d = await imageDataUrl(await (await fetch(u)).blob()); if (!d) skipped++; return d; } catch { skipped++; return undefined; } };
  const cards: SvgCard[] = [];
  for (const { o, w, h, estimated, placeholder } of app.flatCards) {
    if (placeholder) continue;
    const p = app.flatPlaced.get(o.id);
    if (!p) continue;
    const parts = signParts(o);
    const prod = productById(parts.bodyId), chan = CHANNEL_OPTIONS.find((c) => c.id === parts.channelId)?.label;
    const amount = amounts ? quoteObject({ ...o, widthMm: w, heightMm: h }, app.prices).reduce((a, l) => a + l.amount, 0) : 0;
    const lines = [[prod?.name, chan, ...o.sheetIds.map((s) => sheetById(s)?.name)].filter(Boolean).join(' + ') || '종류 미지정', ...describeOptions(o), ...(o.text ? [`“${o.text}”`] : []), ...(o.depthMm ? [`두께 ${fmt(o.depthMm)}mm`] : [])];
    let image: SvgCard['image'];
    if (o.design) {
      const page = app.sources.find((s) => s.id === o.design!.sourceId)?.pages[o.design.page];
      const u = page && (await assetUrl(page.assetId));
      const href = page && u ? await toDataUrl(u) : undefined;
      if (page && href) image = { href, pageW: page.w, pageH: page.h, crop: o.design.crop };
    }
    // 조합형 객체 (4단계): 정면도 배치 그대로, 그림은 data URL 로 묻는다
    const items = layoutParts(o, w, h, w, h);
    const itemHrefs: Record<string, string> = {};
    for (const l of items) {
      const id = l.image ? itemAssetId(l.image, app.sources) : undefined;
      const u = id && (await assetUrl(id));
      const href = u ? await toDataUrl(u) : undefined;
      if (href) itemHrefs[l.id] = href;
    }
    cards.push({ id: o.id, name: o.name, x: p.x, y: p.y, w, h, estimated, lines, amount: amount ? won(amount) : undefined, image, corner: o.shape === 'ellipse' ? 0.5 : o.corner, items, itemHrefs });
  }
  if (skipped) app.notice = `그림 ${skipped}개를 SVG 에 묻지 못해 뺐습니다 (받지 못했거나 그림 파일이 아님).`;
  const title = `${app.access.status === 'ok' ? app.access.projectName : '간판다'} 사인물 전개도`;
  const date = new Date().toLocaleDateString('ko-KR');
  return listSvg({ title, subtitle: amounts ? `${date} · 합계 ${won(app.quote.total)}` : date, cards, ...opts });
}
