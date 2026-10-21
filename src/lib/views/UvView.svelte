<!-- 디자인 파일 화면 (옛 'UV 뷰', 3차): 디자인 소스 페이지 위에서 영역을 잘라 사인물에 입힌다 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { normalizeCrop, type Crop } from '../core/design';
  import { fitRect, type Viewport } from '../core/viewport';
  import type { DesignSource } from '../core/model';

  let viewport: Viewport = $state({ x: 60, y: 60, zoom: 0.4 });
  let canvas: InfiniteCanvas;
  let urls: Record<string, string> = $state({});
  let fitted = false;
  const GAP = 80;

  /** 소스별 페이지 배치: 소스는 세로로, 페이지는 가로로 */
  const layout = $derived.by(() => {
    const out: { source: DesignSource; page: number; x: number; y: number; w: number; h: number }[] = [];
    let y = 0;
    for (const s of app.sources) {
      let x = 0, rowH = 0;
      s.pages.forEach((pg, i) => { out.push({ source: s, page: i, x: s.x ?? x, y: s.y ?? y, w: pg.w, h: pg.h }); x += pg.w + GAP; rowH = Math.max(rowH, pg.h); });
      y += rowH + GAP * 2;
    }
    return out;
  });

  $effect(() => {
    for (const s of app.sources) for (const pg of s.pages) if (!urls[pg.assetId]) assetUrl(pg.assetId).then((u) => u && (urls[pg.assetId] = u));
  });
  $effect(() => { if (!fitted && layout.length && canvas) { fitted = true; fit(); } });

  function fit() {
    if (!layout.length) return;
    const x = Math.min(...layout.map((l) => l.x)), y = Math.min(...layout.map((l) => l.y));
    const w = Math.max(...layout.map((l) => l.x + l.w)) - x, h = Math.max(...layout.map((l) => l.y + l.h)) - y;
    const s = canvas.size();
    viewport = app.compact ? fitRect({ x, y: y - 40, w, h: h + 40 }, s.w, s.h - 70, 20) : fitRect({ x, y: y - 40, w, h: h + 40 }, s.w - 300, s.h, 60);
  }

  const selected = $derived(app.uvObjectId ? app.objects.find((o) => o.id === app.uvObjectId) ?? null : null);

  // 페이지 위 드래그 → 잘라낼 영역
  let draft: { sourceId: string; page: number; x0: number; y0: number; x1: number; y1: number } | null = $state(null);
  function toPage(e: PointerEvent, l: (typeof layout)[number]) {
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    return [w.x - l.x, w.y - l.y] as [number, number];
  }
  function down(e: PointerEvent, l: (typeof layout)[number]) {
    if (e.button !== 0 || !selected || !app.canEdit) return;
    e.stopPropagation();
    const [x, y] = toPage(e, l);
    draft = { sourceId: l.source.id, page: l.page, x0: x, y0: y, x1: x, y1: y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent, l: (typeof layout)[number]) {
    if (!draft) return;
    const [x, y] = toPage(e, l);
    draft = { ...draft, x1: x, y1: y };
  }
  function up(l: (typeof layout)[number]) {
    if (!draft || !selected) { draft = null; return; }
    const crop = normalizeCrop({ x: draft.x0, y: draft.y0, w: draft.x1 - draft.x0, h: draft.y1 - draft.y0 }, { w: l.w, h: l.h });
    if (crop) app.setDesign(selected.id, { sourceId: draft.sourceId, page: draft.page, crop });
    draft = null;
  }
  const draftRect = $derived.by<Crop | null>(() => draft ? { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) } : null);

  /** 페이지 전체를 그대로 입히기 */
  function useWhole(l: (typeof layout)[number]) {
    if (selected) app.setDesign(selected.id, { sourceId: l.source.id, page: l.page, crop: { x: 0, y: 0, w: l.w, h: l.h } });
  }

  const time = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const sourceName = (id: string) => app.sources.find((s) => s.id === id)?.name ?? '(삭제된 소스)';
  const inv = $derived(1 / viewport.zoom);
  /** 휴대폰: 사인물 연결 창(아래 시트)을 열었는가. 하단 탭 [사인물 연결]로 열고, 사인물을 고르면 닫혀 페이지에서 영역을 그린다 */
  let linkOpen = $state(false);
  function pick(id: string) {
    app.uvObjectId = app.uvObjectId === id ? null : id;
    if (app.compact && app.uvObjectId) linkOpen = false;
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && app.view === 'uv') app.uvObjectId = null; }} />

<div class="uv">
  <InfiniteCanvas bind:this={canvas} bind:viewport testid="uv-canvas" onbackgrounddown={() => { app.uvObjectId = null; return false; }}>
    {#each layout as l (l.source.id + ':' + l.page)}
      {@const pg = l.source.pages[l.page]}
      <div class="page" style:left="{l.x}px" style:top="{l.y}px" style:width="{l.w}px" style:height="{l.h}px">
        <div class="label" style:transform="scale({inv})">{l.source.name}{#if l.source.pages.length > 1} · {l.page + 1}쪽{/if}
          {#if selected && app.canEdit}<button onclick={() => useWhole(l)}>전체 입히기</button>{/if}</div>
        {#if urls[pg.assetId]}<img src={urls[pg.assetId]} alt={l.source.name} draggable="false" />{:else}<div class="loading">불러오는 중…</div>{/if}
        <svg data-testid="source-page" data-w={l.w} data-h={l.h} viewBox="0 0 {l.w} {l.h}" class:cropping={!!selected && app.canEdit} role="presentation"
          onpointerdown={(e) => down(e, l)} onpointermove={(e) => move(e, l)} onpointerup={() => up(l)}>
          {#each app.signs.filter((o) => o.design?.sourceId === l.source.id && o.design.page === l.page) as o (o.id)}
            {@const c = o.design!.crop}
            <g class="crop" class:sel={o.id === app.uvObjectId}>
              <rect data-testid={o.id === app.uvObjectId ? 'crop-rect' : 'crop-rect-other'} x={c.x} y={c.y} width={c.w} height={c.h} stroke-width={2 * inv} />
              <text x={c.x} y={c.y - 6 * inv} font-size={12 * inv} stroke-width={3 * inv}>{o.name}</text>
            </g>
          {/each}
          {#if draftRect && draft?.sourceId === l.source.id && draft.page === l.page}
            <rect class="draft" x={draftRect.x} y={draftRect.y} width={draftRect.w} height={draftRect.h} stroke-width={2 * inv} stroke-dasharray="{6 * inv} {4 * inv}" />
          {/if}
        </svg>
      </div>
    {/each}
    {#snippet overlay()}
      {#if !app.sources.length}
        <div class="empty">
          <p>디자인 파일을 올리면 아트보드마다 페이지가 됩니다.</p>
          {#if app.canEdit}<label class="btn primary">디자인 파일 올리기<input data-testid="source-input" type="file" accept=".ai,.pdf,.svg,image/*" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) app.addSourceFile(f); e.currentTarget.value = ''; }} /></label>{/if}
          <small>일러스트레이터(.ai, PDF 호환 저장) · PDF · SVG · PNG · JPG</small>
        </div>
      {/if}
      <div class="tools" class:hidden={app.compact}>
        {#if app.canEdit}
          <label class="file">＋ 디자인 파일<input data-testid={app.sources.length ? 'source-input' : 'source-input-2'} type="file" accept=".ai,.pdf,.svg,image/*" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) app.addSourceFile(f); e.currentTarget.value = ''; }} /></label>
        {/if}
        {#if app.converting}<span class="muted">변환 중…</span>{/if}
        <button onclick={fit} title="전체 보기">⤢</button>
        <span class="muted">{selected ? (app.canEdit ? `"${selected.name}" — 페이지 위를 드래그해 입힐 영역을 그리세요` : `"${selected.name}"`) : '오른쪽 [사인물 연결]에서 사인물을 고르세요'}</span>
      </div>
    {/snippet}
  </InfiniteCanvas>

  {#if app.compact}
    <!-- 휴대폰 하단 탭: 사인물 연결 창 · 파일 올리기 · 전체 보기 -->
    <nav class="utabs" data-testid="design-tabs">
      <button class="lk" class:on={linkOpen} data-testid="link-toggle" onclick={() => (linkOpen = !linkOpen)}>
        사인물 연결 {linkOpen ? '▼' : '▲'}{#if selected}<b>{selected.name}</b>{/if}
      </button>
      {#if app.canEdit}<label class="file">＋ 파일<input data-testid="source-input-m" type="file" accept=".ai,.pdf,.svg,image/*" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) app.addSourceFile(f); e.currentTarget.value = ''; }} /></label>{/if}
      <button onclick={fit} title="전체 보기">⤢</button>
    </nav>
    {#if selected && !linkOpen}<div class="hintbar" data-testid="design-hint">{app.canEdit ? `"${selected.name}" — 페이지를 끌어 입힐 영역을 그리세요` : `"${selected.name}"`}</div>{/if}
  {/if}
  <aside class="side" class:hidden={app.compact && !linkOpen} data-testid="link-panel">
    <h2>사인물 연결 {#if app.compact}<button class="icon" title="닫기" onclick={() => (linkOpen = false)}>✕</button>{/if}</h2>
    <ul>
      {#each app.signs as o (o.id)}
        <li><button data-testid="uv-object" class:on={o.id === app.uvObjectId} onclick={() => pick(o.id)}>
          <span>{o.name}</span>{#if o.design}<small>{sourceName(o.design.sourceId)}</small>{:else}<small class="none">디자인 없음</small>{/if}
        </button></li>
      {:else}<li class="hint">사진 보드에서 사인물을 먼저 만드세요.</li>{/each}
    </ul>
    {#if selected}
      <h3>"{selected.name}" 소스 히스토리</h3>
      {#if selected.design && app.canEdit}<button class="btn small" onclick={() => app.clearDesign(selected.id)}>디자인 떼기</button>{/if}
      <ul class="history">
        {#each selected.designHistory ?? [] as h, i (h.at + ':' + i)}
          <li><button data-testid="design-history-item" class:cur={selected.design && h.sourceId === selected.design.sourceId && h.page === selected.design.page && h.crop.x === selected.design.crop.x && h.crop.y === selected.design.crop.y && h.crop.w === selected.design.crop.w && h.crop.h === selected.design.crop.h}
            disabled={!app.canEdit} onclick={() => app.setDesign(selected.id, { sourceId: h.sourceId, page: h.page, crop: h.crop })}>
            <span>{sourceName(h.sourceId)} · {h.page + 1}쪽 · {h.crop.w}×{h.crop.h}</span><small>{h.author} · {time(h.at)}</small>
          </button></li>
        {:else}<li class="hint">아직 입힌 디자인이 없습니다.</li>{/each}
      </ul>
    {/if}
  </aside>
</div>

<style>
  .uv { position: absolute; inset: 0; }
  .page { position: absolute; background: #fff; box-shadow: 0 6px 30px rgba(0,0,0,0.35); }
  .page img, .page .loading { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .page .loading { display: grid; place-items: center; color: #888; }
  .page svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .page svg.cropping { cursor: crosshair; }
  .label { position: absolute; left: 0; bottom: 100%; transform-origin: 0 100%; white-space: nowrap; color: var(--muted); font-size: 13px; padding-bottom: 4px; display: flex; gap: 8px; align-items: center; }
  .label button { background: var(--hover); border: 1px solid var(--line); color: var(--text); border-radius: 6px; padding: 2px 8px; font: inherit; font-size: 12px; cursor: pointer; }
  .crop rect { fill: rgba(47,139,255,0.15); stroke: var(--blue); }
  .crop.sel rect { fill: color-mix(in srgb, var(--accent) 18%, transparent); stroke: var(--accent); }
  .crop text { fill: #fff; stroke: rgba(0,0,0,0.75); paint-order: stroke; font-weight: 600; pointer-events: none; }
  .draft { fill: color-mix(in srgb, var(--accent) 12%, transparent); stroke: var(--accent); pointer-events: none; }
  .empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--muted); padding-right: 300px; pointer-events: none; }
  .empty > * { pointer-events: auto; }
  .empty p { color: var(--text); margin: 0; }
  .tools { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0,0,0,0.4); margin-right: 150px; }
  .tools .file, .tools button { background: none; border: 0; color: var(--text); padding: 7px 11px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer; }
  .tools .file:hover, .tools button:hover { background: var(--hover); }
  .muted { color: var(--muted); font-size: 12px; }
  .side { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 280px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-size: 15px; }
  h3 { margin: 10px 0 0; font-size: 12px; color: var(--muted); }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  li button { width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 6px; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; cursor: pointer; }
  li button.on { border-color: var(--accent); }
  li button.cur { border-color: var(--ok); }
  li button:disabled { cursor: default; }
  li small { color: var(--muted); font-size: 11px; }
  li small.none { color: var(--warn); }
  .history li button { flex-direction: column; align-items: flex-start; }
  .hint { color: var(--muted); font-size: 12px; }
  .hidden { display: none !important; }
  h2 { display: flex; justify-content: space-between; align-items: center; }
  .utabs { position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 6; display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); }
  .utabs button, .utabs .file { background: none; border: 0; color: var(--text); padding: 9px 10px; border-radius: 8px; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
  .utabs .lk { display: flex; gap: 6px; align-items: center; margin-right: auto; min-width: 0; }
  .utabs .lk b { color: var(--accent); overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .utabs .lk.on { background: var(--hover); }
  .hintbar { position: absolute; left: 8px; right: 8px; bottom: 66px; z-index: 5; background: var(--panel); border: 1px solid var(--accent); border-radius: 10px; padding: 8px 12px; font-size: 12px; }
  @media (max-width: 720px) {
    .side { left: 8px; right: 8px; top: auto; bottom: 66px; width: auto; max-height: 60%; z-index: 7; }
    .empty { padding-right: 0; padding-bottom: 80px; }
  }
</style>
