<!-- 사인물 리스트 뷰: 모든 사인물을 원근 보정해 실제 mm 축척으로 펼친 전개도 + 견적 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { layoutList } from '../core/layout';
  import { cssMatrix3d, quadToRect } from '../core/perspective';
  import { applyHomography } from '../core/homography';
  import { productById, sheetById } from '../core/catalog';
  import { quoteObject, won } from '../core/quote';
  import type { ExtraItem } from '../core/model';
  import DesignFace from '../ui/DesignFace.svelte';
  import { fitRect, type Viewport } from '../core/viewport';
  import type { SignObject } from '../core/model';

  let viewport: Viewport = $state({ x: 60, y: 60, zoom: 0.08 });
  let canvas: InfiniteCanvas;
  let urls: Record<string, string> = $state({});
  let drag: { id: string; dx: number; dy: number; sx: number; sy: number } | null = $state(null);
  let fitted = false;

  /** 치수가 확정(입력 또는 추정)된 사인물만 전개도에 배치 */
  const sized = $derived(
    app.objects.flatMap((o) => {
      const s = app.sizeOf(o);
      return s ? [{ o, ...s }] : [];
    }),
  );
  const pending = $derived(app.objects.filter((o) => !app.sizeOf(o)));
  const placed = $derived(layoutList(sized.map(({ o, w, h }) => ({ id: o.id, w, h, x: o.listX, y: o.listY }))));
  // 견적은 상태에서 (단가표·설치비·추가 항목 반영, 추정 치수 포함)
  const quote = $derived(app.quote);
  const extras = $derived(app.settings.extras ?? []);
  const setExtra = (id: string, patch: Partial<ExtraItem>) => app.setExtras(extras.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addExtra = () => app.setExtras([...extras, { id: Math.random().toString(36).slice(2, 9), label: '', amount: 0 }]);
  const removeExtra = (id: string) => app.setExtras(extras.filter((e) => e.id !== id));
  const setInstall = (v: string) => app.updateSettings({ installFee: v.trim() === '' ? undefined : Math.max(0, Number(v) || 0) });

  $effect(() => {
    for (const p of app.photos) if (!urls[p.assetId]) assetUrl(p.assetId).then((u) => u && (urls[p.assetId] = u));
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
    viewport = fitRect({ x: x - 400, y: y - 600, w: w + 800, h: h + 1600 }, s.w - 360, s.h, 40);
  }

  function warp(o: SignObject, w: number, h: number) {
    try { return cssMatrix3d(quadToRect(o.quad, w, h)); } catch { return 'none'; }
  }

  function clip(o: SignObject, w: number, h: number) {
    if (o.shape === 'ellipse') return 'ellipse(50% 50% at 50% 50%)';
    if (o.shape === 'polygon' && o.polygon) {
      let H: number[];
      try { H = quadToRect(o.quad, w, h); } catch { return 'none'; }
      return `polygon(${o.polygon.map((p) => applyHomography(H, p)).map(([x, y]) => `${x}px ${y}px`).join(',')})`;
    }
    return 'none';
  }

  function down(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    if (!app.canEdit) { app.selectObject(id); return; }
    e.stopPropagation();
    app.selectedId = id;
    const p = placed.get(id)!;
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    drag = { id, dx: w.x - p.x, dy: w.y - p.y, sx: p.x, sy: p.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    drag = { ...drag, sx: w.x - drag.dx, sy: w.y - drag.dy };
  }
  function up() {
    if (!drag) return;
    app.project.updateObject(drag.id, { listX: Math.round(drag.sx), listY: Math.round(drag.sy) });
    drag = null;
  }

  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const inv = $derived(1 / viewport.zoom);

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
    {#each sized as { o, w, h, estimated } (o.id)}
      {@const pos = drag?.id === o.id ? { x: drag.sx, y: drag.sy } : placed.get(o.id)!}
      {@const photo = app.photos.find((p) => p.id === o.photoId)}
      {@const prod = productById(o.productId)}
      {@const amount = quoteObject({ ...o, widthMm: w, heightMm: h }, app.prices).reduce((a, l) => a + l.amount, 0)}
      <div class="item" style:left="{pos.x}px" style:top="{pos.y}px" style:width="{w}px" style:height="{h}px" data-testid="list-card">
        <div
          class="face"
          class:sel={app.selectedId === o.id}
          style:clip-path={clip(o, w, h)}
          role="button"
          tabindex="-1"
          onpointerdown={(e) => down(e, o.id)}
          onpointermove={move}
          onpointerup={up}
        >
          {#if photo && urls[photo.assetId]}
            <img src={urls[photo.assetId]} alt="" draggable="false"
              style:width="{photo.w}px" style:height="{photo.h}px" style:transform={warp(o, w, h)} />
          {/if}
          {#if o.design}<div class="design-on"><DesignFace design={o.design} w={w} h={h} testid="list-design" /></div>{/if}
        </div>
        <!-- 치수선과 사양 카드는 화면 크기 고정 -->
        <div class="dim top" style:transform="scale({inv})" style:width="{w * viewport.zoom}px">{fmt(w)}{estimated ? ' (추정)' : ''}</div>
        <div class="dim side" style:transform="scale({inv})" style:height="{h * viewport.zoom}px"><span>{fmt(h)}</span></div>
        <div class="spec" style:transform="scale({inv})">
          <b>{o.name}</b>
          <span>{fmt(w)} × {fmt(h)} mm{estimated ? ' · 추정' : ''}</span>
          <span class="muted">{[prod?.name, ...o.sheetIds.map((s) => sheetById(s)?.name)].filter(Boolean).join(' + ') || '종류 미지정'}</span>
          <span class="price">{won(amount)}</span>
        </div>
      </div>
    {/each}
    {#snippet overlay()}
      {#if !sized.length}
        <div class="empty">사진 보드에서 사인물 영역을 그리고 치수를 입력하면 여기에 실측 축척으로 펼쳐집니다.</div>
      {/if}
    {/snippet}
  </InfiniteCanvas>

  <aside class="quote">
    <header>
      <h2>견적</h2>
      <span class="actions">
        {#if app.canEdit}<button class="btn small" data-testid="open-prices" onclick={() => (app.pricesOpen = true)}>단가 설정</button>{/if}
        <button class="btn small" data-testid="open-quote-sheet" onclick={() => (app.quoteSheetOpen = true)}>견적서</button>
        <button class="icon" title="전개도 맞춤" onclick={fit}>⤢</button>
      </span>
    </header>
    <div class="lines">
      {#each quote.lines as l, i (i)}
        <div class="line" class:zero={!l.amount}>
          <div><span>{l.label}</span><small>{l.detail}</small></div>
          <b>{won(l.amount)}</b>
        </div>
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
  .face img { position: absolute; left: 0; top: 0; transform-origin: 0 0; max-width: none; pointer-events: none; }
  .design-on { position: absolute; inset: 0; }
  .dim, .spec { position: absolute; transform-origin: 0 0; pointer-events: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .dim { color: var(--dim); font-size: 11px; }
  .dim.top { left: 0; bottom: 100%; transform-origin: 0 100%; text-align: center; border-bottom: 1px solid var(--dim); padding-bottom: 2px; margin-bottom: 4px; }
  .dim.side { left: 100%; top: 0; border-left: 1px solid var(--dim); margin-left: 6px; display: flex; align-items: center; padding-left: 4px; }
  .spec { left: 0; top: 100%; margin-top: 8px; display: flex; flex-direction: column; gap: 1px; font-size: 12px; color: var(--text); }
  .spec b { font-size: 13px; }
  .spec .muted { color: var(--muted); }
  .spec .price { color: var(--accent); font-weight: 700; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); padding-right: 340px; }
  .quote {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.45);
  }
  .quote header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line); gap: 6px; }
  .actions { display: flex; align-items: center; gap: 4px; }
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
</style>
