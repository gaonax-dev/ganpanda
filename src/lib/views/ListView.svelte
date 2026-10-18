<!-- 사인물 리스트 뷰: 모든 사인물을 원근 보정해 실제 mm 축척으로 펼친 전개도 + 견적 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { faceUrl } from '../photoDisplay';
  import { listSvg, type SvgCard, type SvgSheet } from '../core/listSvg';
  import { outlineRenderer } from '../core/svgText';
  import { loadFont } from '../core/textShapes';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { describeOptions } from '../core/options';
  import { faceBadge, faceClip } from '../core/cardFace';
  import { bodyLook } from '../core/render';
  import { bubbleLabel, lastStateOf } from '../core/bubbles';
  import { DEFAULT_TIP } from '../core/bubbleShape';
  import { colorFor } from '../core/presence';
  import BubbleShape from '../ui/BubbleShape.svelte';
  import type { Pt } from '../core/homography';
  import { CHANNEL_OPTIONS, productById, sheetById, signParts } from '../core/catalog';
  import { quoteObject, won, type QuoteLine } from '../core/quote';
  import { findMethod } from '../core/calcMethods';
  import { findSupplierItem, supplierItemLabel } from '../core/supplierPrices';
  import type { ExtraItem } from '../core/model';
  import DesignFace from '../ui/DesignFace.svelte';
  import PartsOverlay from '../ui/PartsOverlay.svelte';
  import { layoutParts } from '../core/partsLayout';
  import { itemAssetId } from '../render/itemImages';
  import { fitRect, type Viewport } from '../core/viewport';

  let viewport: Viewport = $state({ x: 60, y: 60, zoom: 0.08 });
  let canvas: InfiniteCanvas;
  let faces: Record<string, { key: string; url: string }> = $state({});
  /** 끌기: 주 카드 id, 포인터 오프셋, 끌리는 카드들의 시작 위치(mm), 지금까지의 이동량(mm). 선택에 든 카드를 끌면 선택 전체가 함께 (2026-10-17 "리스트의 정면도들을 다중선택하고 이동하게") */
  let drag: { id: string; dx: number; dy: number; base: Record<string, { x: number; y: number }>; ddx: number; ddy: number } | null = $state(null);
  let fitted = false;

  /** 치수가 확정(입력 또는 추정)된 사인물만 전개도에 배치 — 보드의 평면 구역과 같은 목록·배치 (app.flatCards/flatPlaced) */
  const sized = $derived(app.flatCards);
  const pending = $derived(app.signs.filter((o) => !app.sizeOf(o)));
  const placed = $derived(app.flatPlaced);
  // 견적은 상태에서 (단가표·설치비·추가 항목 반영, 추정 치수 포함)
  const quote = $derived(app.quote);
  const extras = $derived(app.settings.extras ?? []);
  const setExtra = (id: string, patch: Partial<ExtraItem>) => app.setExtras(extras.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addExtra = () => app.setExtras([...extras, { id: Math.random().toString(36).slice(2, 9), label: '', amount: 0 }]);
  const removeExtra = (id: string) => app.setExtras(extras.filter((e) => e.id !== id));
  // 줄 금액 (2026-10-16 "사인물 견적서는 수동으로 입력되어야한다. 수동입력후 자동전환버튼"): 비우면 프로젝트 기본(새 프로젝트는 입력 필요)
  const setLine = (key: string, v: string) => app.setLineAmount(key, v.trim() === '' ? null : Math.max(0, Number(v) || 0));
  /** 줄을 누르면 그 사인물의 구성품·단가 연결·공급사 금액(원가) (오너·허가 멤버) */
  let openObj = $state<string | null>(null);
  const linkOf = (l: QuoteLine) => {
    const m = l.priceId ? findMethod(app.prices.methods?.[l.priceId]) : undefined;
    if (m) return `${m.supplier.tag} 계산법 · ${m.label}`;
    const hit = l.priceId ? findSupplierItem(app.prices.links?.[l.priceId]) : null;
    return hit ? `${hit.list.supplier.tag} · ${supplierItemLabel(hit.item)}` : '직접 입력 단가 (원가 없음)';
  };
  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 1000) / 10}%`);
  const setInstall = (v: string) => app.updateSettings({ installFee: v.trim() === '' ? undefined : Math.max(0, Number(v) || 0) });

  $effect(() => {
    // 카드 얼굴: 사진 영역을 펼친 작은 그림 (원본 전체를 카드마다 겹치지 않는다 — 휴대폰 메모리)
    void app.assetEpoch;
    for (const { o, w, h } of sized) {
      const p = app.photos.find((x) => x.id === o.photoId);
      if (!p || o.quad.length !== 4) continue;
      const key = `${o.id}|${o.quad.flat().join(',')}|${Math.round(w)}x${Math.round(h)}`;
      if (faces[o.id]?.key === key) continue;
      faceUrl(p.assetId, p.w, o.quad, w, h, 640).then((u) => { if (u) faces[o.id] = { key, url: u }; });
    }
  });

  $effect(() => {
    if (fitted || !placed.size || !canvas) return;
    fitted = true;
    fit();
  });

  function fit() {
    const r = [...placed.values()];
    if (!r.length) return;
    const x = Math.min(...r.map((p) => p.x)), y = Math.min(...r.map((p) => p.y));
    const w = Math.max(...r.map((p) => p.x + p.w)) - x, h = Math.max(...r.map((p) => p.y + p.h)) - y;
    const s = canvas.size();
    // 데스크톱은 오른쪽 견적 창(360px)을 빼고, 휴대폰은 하단 탭(70px)을 빼고 맞춘다
    viewport = app.compact ? fitRect({ x: x - 400, y: y - 600, w: w + 800, h: h + 1600 }, s.w, s.h - 70, 20) : fitRect({ x: x - 400, y: y - 600, w: w + 800, h: h + 1600 }, s.w - 360, s.h, 40);
  }

  const clip = faceClip;

  function down(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) { app.toggleSelect(id, 'card'); return; } // 다중 선택 (카드끼리만)
    const group = app.cardDragIds(id);
    if (group.length === 1) app.selectObject(id, 'card');
    if (!app.canEdit) return;
    const p = placed.get(id)!;
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    const base: Record<string, { x: number; y: number }> = {};
    for (const gid of group) base[gid] = { ...placed.get(gid)! };
    drag = { id, dx: w.x - p.x, dy: w.y - p.y, base, ddx: 0, ddy: 0 };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    const b = drag.base[drag.id];
    drag = { ...drag, ddx: w.x - drag.dx - b.x, ddy: w.y - drag.dy - b.y };
  }
  function up() {
    if (!drag) return;
    const d = drag;
    for (const [id, b] of Object.entries(d.base)) app.project.updateObject(id, { listX: Math.round(b.x + d.ddx), listY: Math.round(b.y + d.ddy) });
    drag = null;
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const inv = $derived(1 / viewport.zoom);
  /** 휴대폰: 견적 창 접힘 / 반 / 전체 (하단 탭의 [견적]으로 열고 닫음, 창 머리의 버튼으로 확대·축소). 2026-10-15 사용자: "모바일에서 리스트 뷰도 하단에 탭을 두고 견적창 확대축소" */
  let quoteMode = $state<'closed' | 'half' | 'full'>('closed');

  /** 전개도 SVG (디자인 이미지는 data URL 로 묻어 인쇄 창이 따로 불러오지 않게) */
  /** SVG 내려받기 옵션 (일러스트레이터용, 2026-10-17 사용자: "비율, 윤곽선은 옵션으로"): 비율 = A4 맞춤 / 실물 1:1 / 1:10, 글자 윤곽선 */
  let svgPanel = $state(false);
  let svgScale = $state<'a4' | '1' | '0.1'>('1');
  let svgOutline = $state(true);
  let svgBusy = $state(false);
  async function exportSvg() {
    if (svgBusy) return;
    svgBusy = true;
    try {
      const opts: Partial<SvgSheet> = {};
      if (svgScale !== 'a4') opts.scale = Number(svgScale);
      if (svgOutline) opts.text = outlineRenderer(await loadFont(fontUrl));
      const svg = await buildSvg(opts);
      app.lastSvg = svg;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = `${app.access.status === 'ok' ? app.access.projectName : '간판다'} 전개도${svgScale === 'a4' ? '' : svgScale === '1' ? ' 1-1' : ' 1-10'}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      svgPanel = false;
    } catch (e) { app.notice = `SVG 를 만들지 못했습니다: ${e instanceof Error ? e.message : e}`; }
    finally { svgBusy = false; }
  }
  export async function buildSvg(opts: Partial<SvgSheet> = {}): Promise<string> {
    const toDataUrl = async (u: string) => { try { const b = await (await fetch(u)).blob(); return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); }); } catch { return u; } };
    const cards: SvgCard[] = [];
    for (const { o, w, h, estimated } of sized) {
      const p = placed.get(o.id)!;
      const parts = signParts(o);
      const prod = productById(parts.bodyId), chan = CHANNEL_OPTIONS.find((c) => c.id === parts.channelId)?.label;
      const amount = quoteObject({ ...o, widthMm: w, heightMm: h }, app.prices).reduce((a, l) => a + l.amount, 0);
      const lines = [[prod?.name, chan, ...o.sheetIds.map((s) => sheetById(s)?.name)].filter(Boolean).join(' + ') || '종류 미지정', ...describeOptions(o), ...(o.text ? [`“${o.text}”`] : []), ...(o.depthMm ? [`두께 ${fmt(o.depthMm)}mm`] : [])];
      let image: SvgCard['image'];
      if (o.design) {
        const page = app.sources.find((s) => s.id === o.design!.sourceId)?.pages[o.design.page];
        const u = page && (await assetUrl(page.assetId));
        if (page && u) image = { href: await toDataUrl(u), pageW: page.w, pageH: page.h, crop: o.design.crop };
      }
      // 조합형 객체 (4단계): 정면도 배치 그대로, 그림은 data URL 로 묻는다
      const items = layoutParts(o, w, h, w, h);
      const itemHrefs: Record<string, string> = {};
      for (const l of items) {
        const id = l.image ? itemAssetId(l.image, app.sources) : undefined;
        const u = id && (await assetUrl(id));
        if (u) itemHrefs[l.id] = await toDataUrl(u);
      }
      cards.push({ id: o.id, name: o.name, x: p.x, y: p.y, w, h, estimated, lines, amount: amount ? won(amount) : undefined, image, corner: o.shape === 'ellipse' ? 0.5 : o.corner, items, itemHrefs });
    }
    const title = `${app.access.status === 'ok' ? app.access.projectName : '간판다'} 사인물 전개도`;
    return listSvg({ title, subtitle: `${new Date().toLocaleDateString('ko-KR')} · 합계 ${won(quote.total)}`, cards, ...opts });
  }
  /** SVG 를 인쇄 창에 띄운다 → 브라우저의 "PDF 로 저장" (A4 가로) */
  async function exportPdf() {
    const svg = await buildSvg();
    app.lastSvg = svg;
    const w = window.open('', '_blank');
    if (!w) { app.notice = '팝업이 막혀 PDF 창을 열 수 없습니다. 팝업을 허용해 주세요.'; return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>사인물 전개도</title><style>
  .svgwrap { position: static; }
  .svgopts { position: absolute; left: 12px; right: 12px; top: 100%; margin-top: 2px; z-index: 5; width: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
  .svgopts label { display: flex; align-items: center; gap: 6px; }
  .svgopts small { color: var(--muted); }
  .svgopts .btn { align-self: flex-end; margin-top: 4px; }@page{size:A4 landscape;margin:0}html,body{margin:0;background:#fff}svg{width:297mm;height:210mm;display:block}</style></head><body>${svg}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
    w.document.close();
  }

  async function copyQuote() {
    const text = [
      '[사인물 견적]',
      ...quote.lines.map((l) => `- ${l.label} (${l.detail}): ${won(l.amount)}`),
      `- 설치·운반비: ${won(quote.install)}`,
      ...quote.extras.map((e) => `- ${e.label}: ${won(e.amount)}`),
      quote.vatIncluded ? `합계 ${won(quote.total)} (부가세 ${won(quote.vat)} 포함)` : `공급가 ${won(quote.subtotal)} / 부가세 ${won(quote.vat)} / 합계 ${won(quote.total)}`,
    ].join('\n');
    await navigator.clipboard.writeText(text);
  }
</script>

<div class="list-view">
  <InfiniteCanvas bind:this={canvas} bind:viewport testid="list-canvas" onfit={fit} onbackgrounddown={() => { app.selectedId = null; }}>
    <!-- 사양 카드의 버튼·셀렉터는 카드 드래그와 무관 -->
    {#each sized as { o, w, h, estimated } (o.id)}
      {@const pos = drag?.base[o.id] ? { x: drag.base[o.id].x + drag.ddx, y: drag.base[o.id].y + drag.ddy } : placed.get(o.id)!}
      {@const photo = app.photos.find((p) => p.id === o.photoId)}
      {@const parts = signParts(o)}
      {@const prod = productById(parts.bodyId)}
      {@const chan = CHANNEL_OPTIONS.find((c) => c.id === parts.channelId)?.label}
      {@const amount = quoteObject({ ...o, widthMm: w, heightMm: h }, app.prices).reduce((a, l) => a + l.amount, 0)}
      {@const look = bodyLook(o)}
      {@const badge = faceBadge(o)}
      {@const lastMsg = lastStateOf(app.messages, o.sameAs ?? o.id)}
      {@const tipC = ((o.bubble?.tip ?? DEFAULT_TIP).map((v, i) => v * (i ? h : w))) as Pt}
      {@const bodyC = (o.bubble?.body ? o.bubble.body.map((v, i) => v * (i ? h : w)) : [tipC[0] + 56 * inv, tipC[1] - 48 * inv]) as Pt}
      {@const saveBubble = (tp: Pt, bp: Pt) => app.project.updateObject(o.id, { bubble: { tip: [tp[0] / w, tp[1] / h].map((v) => Math.round(v * 1e4) / 1e4) as [number, number], body: [bp[0] / w, bp[1] / h].map((v) => Math.round(v * 1e4) / 1e4) as [number, number] } })}
      <div class="item" style:left="{pos.x}px" style:top="{pos.y}px" style:width="{w}px" style:height="{h}px" data-testid="list-card">
        <div
          class="face"
          class:sel={app.selectionKind === 'shape' && app.selectedId === o.id}
          class:multi={app.selectionKind === 'card' && app.selectionIds.includes(o.id)}
          data-multi={(app.selectionKind === 'card' && app.selectionIds.includes(o.id)) || undefined}
          style:clip-path={clip(o, w, h)}
          role="button"
          tabindex="-1"
          onpointerdown={(e) => down(e, o.id)}
          onpointermove={move}
          onpointerup={up}
        >
          {#if photo && faces[o.id]}
            <img class="flat" src={faces[o.id].url} alt="" draggable="false" />
          {/if}
          {#if look}<div class="fill" data-testid="card-fill" style:background={look.color} style:opacity={look.opacity}></div>{/if}
          {#if o.design}<div class="design-on"><DesignFace design={o.design} w={w} h={h} testid="list-design" /></div>{/if}
          <PartsOverlay {o} mmW={w} mmH={h} {w} {h} />
        </div>
        {#if lastMsg}
          <!-- 정면도 말풍선 (2026-10-18): 사진의 사인물 말풍선과 같은 자리(사인물 좌표) -->
          <svg class="bubbles" width={w} height={h} viewBox="0 0 {w} {h}" overflow="visible">
            <BubbleShape tip={tipC} body={bodyC} label={bubbleLabel({ last: lastMsg, me: app.nickname })} badge={app.unread[o.sameAs ?? o.id] ?? 0} color={colorFor(lastMsg.author)} u={inv} editable={app.canEdit} testid="card-bubble" attrs={{ 'data-id': o.id }}
              onclick={() => app.openChat(o.id)}
              onwhole={(dx, dy) => saveBubble([tipC[0] + dx, tipC[1] + dy], [bodyC[0] + dx, bodyC[1] + dy])}
              onbody={(dx, dy) => saveBubble(tipC, [bodyC[0] + dx, bodyC[1] + dy])}
              ontip={(dx, dy) => saveBubble([tipC[0] + dx, tipC[1] + dy], bodyC)}
              ondragend={() => app.editBoundary()} />
          </svg>
        {/if}
        <!-- 치수선과 사양 카드는 화면 크기 고정 -->
        <div class="dim top" style:transform="scale({inv})" style:width="{w * viewport.zoom}px">{fmt(w)}{estimated ? ' (추정)' : ''}</div>
        <div class="dim side" style:transform="scale({inv})" style:height="{h * viewport.zoom}px"><span>{fmt(h)}</span></div>
        <div class="spec" style:transform="scale({inv})">
          <b><span class="badge {badge.id}" data-testid="card-badge" data-state={badge.id}>{badge.label}</span>{o.name}</b>
          <span>{fmt(w)} × {fmt(h)} mm{estimated ? ' · 추정' : ''}</span>
          <span class="muted">{[prod?.name, chan, ...o.sheetIds.map((s) => sheetById(s)?.name)].filter(Boolean).join(' + ') || '종류 미지정'}</span>
          <span class="price">{won(amount)}</span>
          {#if app.canEdit && app.photos.length}
            <!-- 사진 보드에 올리기: 사진이 하나면 바로, 여럿이면 고른다 (같은 사인물로 연결) -->
            {#if app.photos.length === 1}
              <button class="place" data-testid="place-on-photo" onclick={() => app.placeOnPhoto(o.id, app.photos[0].id)}>📷 사진에 올리기</button>
            {:else}
              <select class="place" data-testid="place-on-photo" value="" onchange={(e) => { const id = e.currentTarget.value; if (id) app.placeOnPhoto(o.id, id); e.currentTarget.value = ''; }}>
                <option value="">📷 사진에 올리기…</option>
                {#each app.photos as p (p.id)}<option value={p.id}>{p.name}{o.photoId === p.id || app.objects.some((c) => c.photoId === p.id && (c.sameAs ?? c.id) === (o.sameAs ?? o.id)) ? ' (이미 있음)' : ''}</option>{/each}
              </select>
            {/if}
          {/if}
        </div>
      </div>
    {/each}
    {#snippet overlay()}
      {#if !sized.length}
        <div class="empty">사진 보드에서 사인물 영역을 그리고 치수를 입력하면 여기에 실측 축척으로 펼쳐집니다.</div>
      {/if}
    {/snippet}
  </InfiniteCanvas>

  {#if app.compact}
    <!-- 휴대폰 하단 탭 -->
    <nav class="ltabs" data-testid="list-tabs">
      <button class="qt" class:on={quoteMode !== 'closed'} data-testid="quote-toggle" onclick={() => (quoteMode = quoteMode === 'closed' ? 'half' : 'closed')}>
        견적 {quoteMode === 'closed' ? '▲' : '▼'}<b>{won(quote.total)}</b>
      </button>
      {#if app.canEdit}<button data-testid="tab-prices" onclick={() => (app.pricesOpen = true)}>단가</button>{/if}
      <button data-testid="tab-order" onclick={() => (app.orderOpen = true)}>주문</button>
      <button data-testid="tab-quote-sheet" onclick={() => (app.quoteSheetOpen = true)}>주문서</button>
      <button data-testid="tab-pdf" disabled={!sized.length} onclick={exportPdf}>PDF</button>
      <button title="전개도 맞춤" onclick={fit}>⤢</button>
    </nav>
  {/if}
  <aside class="quote" class:hidden={app.compact && quoteMode === 'closed'} class:full={app.compact && quoteMode === 'full'} data-testid="quote-panel" data-mode={app.compact ? quoteMode : 'side'}>
    <header>
      <h2>견적</h2>
      {#if app.compact}
        <button class="icon" data-testid="quote-size" title={quoteMode === 'full' ? '줄이기' : '크게'} onclick={() => (quoteMode = quoteMode === 'full' ? 'half' : 'full')}>{quoteMode === 'full' ? '⤡' : '⤢'}</button>
        <button class="icon" title="접기" data-testid="quote-close" onclick={() => (quoteMode = 'closed')}>✕</button>
      {/if}
      <span class="actions" class:hidden={app.compact}>
        {#if app.canEdit}<button class="btn small" data-testid="open-prices" onclick={() => (app.pricesOpen = true)}>단가 설정</button>{/if}
        <button class="btn small" data-testid="open-order" onclick={() => (app.orderOpen = true)}>주문 정보</button>
        <button class="btn small" data-testid="open-quote-sheet" onclick={() => (app.quoteSheetOpen = true)}>주문서·견적서</button>
        <button class="btn small" data-testid="export-pdf" title="전개도를 SVG 로 그려 PDF 로 저장 (인쇄 창)" disabled={!sized.length} onclick={exportPdf}>PDF</button>
        <span class="svgwrap">
          <button class="btn small" data-testid="export-svg" title="일러스트레이터용 SVG 내려받기 (비율·윤곽선 옵션)" disabled={!sized.length} onclick={() => (svgPanel = !svgPanel)}>SVG</button>
          {#if svgPanel}
            <div class="svgopts" data-testid="svg-options">
              <b>SVG 내려받기 <small>(일러스트레이터)</small></b>
              <label><input type="radio" name="svgscale" value="1" bind:group={svgScale} data-testid="svg-scale-1" /> 실물 1:1 <small>(제작 도면, mm 그대로)</small></label>
              <label><input type="radio" name="svgscale" value="0.1" bind:group={svgScale} data-testid="svg-scale-10" /> 1:10 <small>(큰 간판 · 아트보드 한계 5.8m)</small></label>
              <label><input type="radio" name="svgscale" value="a4" bind:group={svgScale} data-testid="svg-scale-a4" /> A4 맞춤 <small>(PDF 와 같은 모양)</small></label>
              <label><input type="checkbox" bind:checked={svgOutline} data-testid="svg-outline" /> 글자를 윤곽선으로 <small>(폰트 없어도 같은 모양, 글자 편집 불가)</small></label>
              <button class="btn small primary" data-testid="svg-download" disabled={svgBusy} onclick={exportSvg}>{svgBusy ? '만드는 중…' : '내려받기'}</button>
            </div>
          {/if}
        </span>
        <button class="icon" title="전개도 맞춤" onclick={fit}>⤢</button>
      </span>
    </header>
    <div class="lines">
      {#if app.canEdit && quote.lines.some((l) => l.manual)}
        <button class="link" data-testid="quote-auto-all" onclick={() => app.autoAllLines()}>전체 자동 금액으로</button>
      {/if}
      {#each quote.lines as l, i (i)}
        <div class="line" class:zero={!l.amount} class:loss={app.seesMargin && l.loss} data-testid="quote-line" data-key={l.key}>
          <button class="info" data-testid="line-open" disabled={!app.seesMargin} onclick={() => (openObj = openObj === l.objectId ? null : l.objectId)}><span>{l.label}</span><small>{l.detail}</small>
            {#if app.seesMargin && l.cost !== undefined && !l.needsInput}
              <small class="mg" data-testid="line-margin">{app.seesCost ? `원가 ${won(l.cost)} · ` : ''}이익율 {pct(l.amount ? (l.amount - l.cost) / l.amount : null)}{#if l.loss} <b class="lossb" data-testid="line-loss">손해</b>{/if}</small>
            {/if}
          </button>
          {#if app.canEdit}
            <span class="amtcell">
              <input class="amt" data-testid="line-amount" type="number" min="0" step="1000" value={l.needsInput ? '' : l.amount} placeholder="금액 입력" title={`자동 금액 ${won(l.auto ?? 0)}`} onchange={(e) => setLine(l.key, e.currentTarget.value)} onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              {#if l.manual}<button class="btn small" data-testid="line-auto" title={`자동 금액 ${won(l.auto ?? 0)}으로`} onclick={() => app.setLineAmount(l.key, 'auto')}>자동</button>{:else}<span class="autob" data-testid="line-is-auto">자동</span>{/if}
            </span>
          {:else}<b>{won(l.amount)}</b>{/if}
        </div>
        {#if app.seesMargin && openObj === l.objectId && quote.lines.findIndex((x) => x.objectId === l.objectId) === i}
          <table class="parts" data-testid="line-parts">
            <thead><tr><th>구성품</th><th>단가 연결</th>{#if app.seesCost}<th>공급사 금액</th>{/if}<th>판매가</th><th>이익율</th></tr></thead>
            <tbody>
              {#each quote.lines.filter((x) => x.objectId === l.objectId) as x (x.key)}
                <tr class:loss={x.loss}>
                  <td>{x.label.split(' · ').slice(1).join(' · ')}</td><td>{linkOf(x)}</td>
                  {#if app.seesCost}<td class="r">{x.cost !== undefined ? won(x.cost) : '—'}</td>{/if}
                  <td class="r">{x.needsInput ? '입력 필요' : won(x.amount)}</td>
                  <td class="r">{x.cost !== undefined && !x.needsInput && x.amount ? pct((x.amount - x.cost) / x.amount) : '—'}{#if x.loss} 손해{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {:else}
        <p class="hint">종류·시트를 지정한 사인물이 없습니다.</p>
      {/each}
      <div class="line" data-testid="quote-install">
        <div><span>설치·운반비</span>{#if app.canEdit}<small>비우면 단가표 기본값 ({won(app.prices.install)})</small>{/if}</div>
        {#if app.canEdit}
          <input class="amt" type="number" min="0" step="1000" value={app.settings.installFee ?? ''} placeholder={String(app.prices.install)} onchange={(e) => setInstall(e.currentTarget.value)} />
        {:else}<b>{won(quote.install)}</b>{/if}
      </div>
      {#each extras as e (e.id)}
        <div class="line extra" data-testid="quote-extra">
          {#if app.canEdit}
            <input data-testid="extra-label" value={e.label} placeholder="추가 항목 (예: 야간 작업, 소개 할인)" onchange={(ev) => setExtra(e.id, { label: ev.currentTarget.value })} />
            <input class="amt" data-testid="extra-amount" type="number" step="1000" value={e.amount} placeholder="금액 (할인은 −)" onchange={(ev) => setExtra(e.id, { amount: Number(ev.currentTarget.value) || 0 })} onkeydown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} />
            <button class="icon" title="삭제" onclick={() => removeExtra(e.id)}>✕</button>
          {:else}
            <div><span>{e.label || '추가 항목'}</span></div><b>{won(e.amount)}</b>
          {/if}
        </div>
      {/each}
      {#if app.canEdit}<button class="link" data-testid="extra-add" onclick={addExtra}>+ 추가 항목·할인</button>{/if}
      {#if pending.length}
        <div class="pending">
          <b>치수 필요 {pending.length}건</b>
          {#each pending as o (o.id)}<button class="link" onclick={() => { app.selectedId = o.id; app.view = 'board'; }}>{o.name}</button>{/each}
        </div>
      {/if}
    </div>
    <footer>
      {#if quote.vatIncluded}
        <div class="sum"><span data-testid="quote-vat-note">부가세 {won(quote.vat)} 포함</span><span></span></div>
      {:else}
        <div class="sum"><span>공급가</span><span>{won(quote.subtotal)}</span></div>
        <div class="sum"><span data-testid="quote-vat-note">부가세 (10%)</span><span>{won(quote.vat)}</span></div>
      {/if}
      <div class="sum total"><span>합계</span><span data-testid="quote-total">{won(quote.total)}</span></div>
      {#if quote.lines.some((l) => l.needsInput)}<p class="hint warn" data-testid="quote-needs-input">금액을 넣지 않은 줄 {quote.lines.filter((l) => l.needsInput).length}건</p>{/if}
      {#if app.seesMargin}
        <div class="margin" class:loss={quote.margin.profit < 0} data-testid="quote-margin">
          {#if app.seesCost}<span>원가 {won(quote.margin.cost)} · 이익 {won(quote.margin.profit)}</span>{/if}
          <span>이익율 <b data-testid="quote-margin-rate">{pct(quote.margin.rate)}</b>{#if quote.margin.profit < 0} <b class="lossb" data-testid="quote-loss">손해</b>{/if}</span>
          {#if quote.margin.uncosted}<small>원가 없는 줄 {quote.margin.uncosted}건 제외 (직접 입력 단가)</small>{/if}
        </div>
      {/if}
      <button class="btn small" onclick={copyQuote}>견적 텍스트 복사</button>
      <p class="hint">{app.settings.prices ? '이 프로젝트의 단가표 기준' : '※ 예시 단가 — 단가 설정에서 바꾸세요'}</p>
    </footer>
  </aside>
</div>

<style>
  .list-view { position: absolute; inset: 0; }
  .item { position: absolute; }
  .face { position: absolute; inset: 0; overflow: hidden; background: #333; cursor: grab; outline: 1px solid rgba(255,255,255,0.25); }
  .face.sel { outline: 2px solid var(--accent); }
  .face.multi { outline: 2px dashed var(--accent); }
  .face img { position: absolute; left: 0; top: 0; transform-origin: 0 0; max-width: none; pointer-events: none; }
  .face img.flat { width: 100%; height: 100%; }
  .fill { position: absolute; inset: 0; pointer-events: none; }
  .design-on { position: absolute; inset: 0; }
  .bubbles { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; z-index: 3; }
  .bubbles :global(.bubble) { pointer-events: auto; }
  .badge { display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; font-size: 9px; font-weight: 600; line-height: 14px; vertical-align: 1px; color: var(--muted); border: 1px solid var(--line); }
  .badge.settings { color: var(--accent); border-color: rgba(255, 204, 0, 0.5); }
  .badge.design { color: #1a1500; background: var(--accent); border-color: var(--accent); }
  .dim, .spec { position: absolute; transform-origin: 0 0; pointer-events: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .spec .place { pointer-events: auto; }
  .dim { color: var(--dim); font-size: 11px; }
  .dim.top { left: 0; bottom: 100%; transform-origin: 0 100%; text-align: center; border-bottom: 1px solid var(--dim); padding-bottom: 2px; margin-bottom: 4px; }
  .dim.side { left: 100%; top: 0; border-left: 1px solid var(--dim); margin-left: 6px; display: flex; align-items: center; padding-left: 4px; }
  .spec { left: 0; top: 100%; margin-top: 8px; display: flex; flex-direction: column; gap: 1px; font-size: 12px; color: var(--text); }
  .spec b { font-size: 13px; }
  .spec .muted { color: var(--muted); }
  .spec .price { color: var(--accent); font-weight: 700; }
  .spec .place { margin-top: 4px; align-self: flex-start; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 3px 8px; font: inherit; font-size: 11px; cursor: pointer; width: auto; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); padding-right: 340px; }
  .quote {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.45);
  }
  /* 머리의 단추가 330px 안에 다 안 들어가 잘리고 SVG 옵션 창이 패널 밖으로 밀리던 문제 (2026-10-18 사용자: "사인물 리스트 내보내기 속성 패널의 메뉴가 가려진다. svg 의 경우엔 클릭하면 완전 가려짐") → 줄바꿈 + 옵션 창은 머리 기준 패널 안에 */
  .quote header { position: relative; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line); gap: 6px; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .line.extra { gap: 4px; align-items: center; }
  .line.extra input:first-child { flex: 1; min-width: 0; }
  .amt { width: 120px; text-align: right; }
  .quote h2 { margin: 0; font-size: 16px; }
  .lines { flex: 1; overflow-y: auto; padding: 6px 14px; }
  .line { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
  .line small { display: block; color: var(--muted); }
  .line b { white-space: nowrap; }
  .line.zero b { color: var(--muted); }
  .pending { margin-top: 10px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: var(--warn); }
  .link { background: none; border: 0; color: var(--blue); text-decoration: underline; cursor: pointer; font: inherit; font-size: 12px; padding: 0; }
  .quote footer { padding: 12px 14px; border-top: 1px solid var(--line); }
  .sum { display: flex; justify-content: space-between; font-size: 13px; padding: 2px 0; font-variant-numeric: tabular-nums; }
  .sum.total { font-size: 16px; font-weight: 800; color: var(--accent); margin: 4px 0 10px; }
  .hidden { display: none !important; }
  .line .info { all: unset; display: flex; flex-direction: column; flex: 1; min-width: 0; cursor: pointer; }
  .line .info:disabled { cursor: default; }
  .amtcell { display: flex; align-items: center; gap: 4px; }
  .autob { font-size: 10px; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
  .mg { color: var(--muted); }
  .line.loss { background: rgba(229, 72, 77, 0.08); }
  .lossb { color: #e5484d; font-size: 11px; }
  .parts { width: 100%; font-size: 11px; border-collapse: collapse; margin: 0 0 8px; }
  .parts th, .parts td { padding: 2px 4px; border-top: 1px solid var(--line); text-align: left; }
  .parts .r { text-align: right; white-space: nowrap; }
  .parts tr.loss td { color: #e5484d; }
  .margin { display: flex; flex-direction: column; gap: 2px; font-size: 12px; margin: 4px 0; }
  .margin.loss b { color: #e5484d; }
  .warn { color: #e5a00d; }
  .ltabs { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 6; display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); overflow-x: auto; scrollbar-width: none; }
  .ltabs button { background: none; border: 0; color: var(--text); padding: 9px 10px; border-radius: 8px; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
  .ltabs button:disabled { opacity: 0.35; }
  .ltabs .qt { display: flex; gap: 6px; align-items: center; margin-right: auto; }
  .ltabs .qt b { color: var(--accent); }
  .ltabs .qt.on { background: var(--hover); }
  @media (max-width: 720px) {
    .quote { left: 8px; right: 8px; top: auto; bottom: 66px; width: auto; height: 50%; }
    .quote.full { top: 8px; height: auto; }
    .empty { padding-right: 0; padding-bottom: 80px; }
    .quote header { justify-content: flex-start; }
    .quote header h2 { flex: 1; }
  }
</style>
