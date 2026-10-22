<!--
  단면 쌓기 (재료 조합 S1, 2026-10-22 사용자: "단면 쌓기는 2.5d가 좋을것 같아", "단면 하단에 폴딩으로 속성은", "단면쌓기는 인터페이스야",
  "갈바 위에 체널과 아크릴스카시가 있다면 두개가 같은 층에 있다", "해당 층을 클릭하면 정면도로 활용 가능하다") — 설계 docs/features/material-stack.md
  · 위: 2.5D 경사 투영 단면 (가로·세로 그대로, 깊이는 오른쪽 위 30°, 두께는 과장해서 얇은 판도 보이게). 앞이 아래·왼쪽
  · 아래: 접이 속성 — 층 줄 > 구성 요소 줄 > 재료 층·속성. 그림에서 고르면 접이가 펼쳐지고, 접이를 펼치면 그림에서 강조 (한 번에 하나)
  · 층의 [정면도] = 배치 탭(정면도 편집), 고치기는 지금의 구성 요소 편집기(PartsEditor) 그대로
-->
<script lang="ts">
  import type { SignObject, SignPart } from '../core/model';
  import { crossSection, type CsItem } from '../core/crossSection';
  import { componentOf, surfaceOf } from '../core/components';
  import { commitParts, newPart, partsOf } from '../core/parts';
  import PartsEditor from './PartsEditor.svelte';

  let { obj, ro, update, hasBody, kinds, onTab }: {
    obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; hasBody: boolean; kinds: SignPart['kind'][];
    /** 다른 탭으로 (몸통·배치·구성 요소) */ onTab: (tab: string) => void;
  } = $props();

  const parts = $derived(partsOf(obj));
  const cs = $derived(crossSection(obj, { parts, hasBody }));
  /** 펼친 층(0 = 프레임)·구성 요소 */
  let openTier = $state<number | null>(null);
  let openPart = $state<string | null>(null);
  let explode = $state(false);

  // ── 2.5D 그림 ──
  const VW = 560, M = 16, K = 4, MIN_PX = 5, GAP = 16;
  const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
  const MAT_COLOR: Record<string, string> = { iron: '#8b9096', rubber: '#3b3b3f', alu: '#c4cad0', 'alu-gold': '#d4b25e', 'alu-silver': '#d9dde1', stain: '#dfe3e7', titan: '#b9a46c', acrylic: '#cfe6ff', foamex: '#f3f3f3', channel: '#eef2f6', sheet: '#7cc0ff' };
  interface Block { item: CsItem | null; tier: number; x0: number; x1: number; y0: number; y1: number; zp0: number; zp1: number; color: string; side: string; label: string }
  const draw = $derived.by(() => {
    const blocksMm: { item: CsItem | null; tier: number; x0: number; x1: number; y0: number; y1: number; seg: { px: number; color: string; side: string }[] }[] = [];
    const s0 = (VW - 2 * M) / (cs.width * 1.25);
    const s = Math.min(s0, 150 / cs.height); // 세로가 너무 크지 않게
    const px = (mm: number) => Math.max(MIN_PX, mm * s * K);
    // 깊이 px: 프레임 → 구성 요소 (올린 곳 앞에서 시작)
    const start = new Map<string, number>();
    const framePx = cs.frame ? px(cs.frame.depth || 1) : 0;
    if (cs.frame) blocksMm.push({ item: null, tier: 1, x0: -cs.width / 2, x1: cs.width / 2, y0: -cs.height / 2, y1: cs.height / 2, seg: [{ px: framePx, color: '#c9ced4', side: '#aab1b8' }] });
    for (const t of cs.tiers) for (const it of t.items) {
      const surf = surfaceOf(it.part);
      const seg = it.layers.map((l, i) => {
        const top = i === it.layers.length - 1;
        const c = it.part.kind === 'sheet' ? MAT_COLOR.sheet : (top && surf.face) || MAT_COLOR[l.material] || componentOf(it.part.kind).color;
        return { px: px(l.thickness || 0.1), color: c, side: surf.side || shade(c) };
      });
      blocksMm.push({ item: it, tier: t.n, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1, seg });
    }
    // 시작 깊이: 올린 곳의 끝 (펼치면 층 사이를 띄운다)
    const out: Block[] = [];
    for (const b of blocksMm) {
      const host = b.item?.part.on && b.item.part.on !== 'frame' ? b.item.part.on : null;
      let z = b.item ? (host && start.has(host) ? start.get(host)! : framePx) : 0;
      if (b.item && explode) z += GAP * (b.tier - (cs.frame ? 1 : 0));
      for (const sg of b.seg) { out.push({ item: b.item, tier: b.tier, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, zp0: z, zp1: z + sg.px, color: sg.color, side: sg.side, label: b.item?.label ?? cs.frame?.label ?? '' }); z += sg.px; }
      if (b.item) start.set(b.item.part.id, z);
    }
    const D = Math.max(1, ...out.map((b) => b.zp1));
    const fw = cs.width * s, fh = cs.height * s;
    const ox = M, oy = M + D * SIN; // 앞면 왼쪽 위 기준
    const toScreen = (xmm: number, ymm: number, zp: number): [number, number] => [ox + (xmm + cs.width / 2) * s + (D - zp) * COS, oy + (cs.height / 2 - ymm) * s - (D - zp) * SIN];
    const polys = out.sort((a, b) => a.zp1 - b.zp1 || a.x0 - b.x0).map((b) => {
      const ftl = toScreen(b.x0, b.y1, b.zp1), ftr = toScreen(b.x1, b.y1, b.zp1), fbr = toScreen(b.x1, b.y0, b.zp1), fbl = toScreen(b.x0, b.y0, b.zp1);
      const btl = toScreen(b.x0, b.y1, b.zp0), btr = toScreen(b.x1, b.y1, b.zp0), bbr = toScreen(b.x1, b.y0, b.zp0);
      const pts = (ps: [number, number][]) => ps.map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).join(' ');
      return { b, top: pts([ftl, ftr, btr, btl]), side: pts([ftr, fbr, bbr, btr]), front: pts([ftl, ftr, fbr, fbl]), cx: (ftl[0] + fbr[0]) / 2, cy: (ftl[1] + fbr[1]) / 2, fw: ftr[0] - ftl[0], fh: fbl[1] - ftl[1] };
    });
    return { polys, w: Math.ceil(ox + fw + D * COS + M), h: Math.ceil(oy + fh + M) };
  });
  function shade(hex: string) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '#888';
    const n = parseInt(m[1], 16), f = 0.78;
    return `#${[16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * f).toString(16).padStart(2, '0')).join('')}`;
  }
  const firstText = (p: SignPart) => p.items.find((i) => i.kind === 'text')?.text?.trim().slice(0, 6) ?? '';

  function pick(item: CsItem | null, tier: number) {
    if (!item) { openTier = openTier === 1 && cs.frame ? null : 1; openPart = null; return; }
    openTier = tier; openPart = item.part.id;
  }
  const isSel = (b: Block) => (b.item ? openPart === b.item.part.id : openTier === 1 && !!cs.frame && !openPart);

  function add(kind: SignPart['kind'], on?: string, type?: string) {
    const ps: SignPart[] = JSON.parse(JSON.stringify(parts));
    const np = newPart(kind, type);
    if (on) np.on = on;
    ps.push(np);
    update(commitParts(obj, ps));
    openPart = np.id;
    openTier = null;
  }
  // 새로 더한 구성 요소의 층을 펼친다
  $effect(() => { if (openPart && openTier === null) { const t = cs.tiers.find((x) => x.items.some((i) => i.part.id === openPart)); if (t) openTier = t.n; } });
  const fmtT = (t: number) => `${Math.round(t * 10) / 10}T`;
  const layerText = (it: CsItem) => it.layers.map((l) => `${l.label} ${fmtT(l.thickness)}`).join(' + ');
  const addKinds = $derived(kinds.filter((k) => componentOf(k).takesItems));
</script>

<div class="cs" data-testid="cross-section">
  <div class="figure">
    <svg data-testid="cs-figure" viewBox="0 0 {draw.w} {draw.h}" width="100%" style:max-height="260px" role="img" aria-label="단면 쌓기">
      {#each draw.polys as p, i (i)}
        <g class="blk" class:sel={isSel(p.b)} data-testid="cs-block" data-tier={p.b.tier} data-part={p.b.item?.part.id ?? 'frame'} role="button" tabindex="-1"
          onclick={() => pick(p.b.item, p.b.tier)} onkeydown={(e) => { if (e.key === 'Enter') pick(p.b.item, p.b.tier); }}>
          <polygon points={p.top} fill={p.b.color} stroke="#0006" stroke-width="0.6" />
          <polygon points={p.side} fill={p.b.side} stroke="#0006" stroke-width="0.6" />
          <polygon class="front" points={p.front} fill={p.b.color} stroke="#0008" stroke-width="0.8" />
          {#if p.b.item && p.fw > 24 && p.fh > 10 && firstText(p.b.item.part)}
            <text x={p.cx} y={p.cy} font-size={Math.min(14, p.fh * 0.6)} text-anchor="middle" dominant-baseline="central" fill="#222" pointer-events="none">{firstText(p.b.item.part)}</text>
          {/if}
        </g>
      {/each}
    </svg>
    <div class="figbar">
      <span class="hint">층을 누르면 아래 속성이 펼쳐집니다 · 두께는 보기 좋게 과장</span>
      <button class="btn small" data-testid="cs-explode" class:on={explode} onclick={() => (explode = !explode)}>{explode ? '붙임' : '펼침'}</button>
    </div>
  </div>

  <!-- 접이 속성: 층 > 구성 요소 > 재료 층 (앞이 위) -->
  <div class="fold">
    {#each [...cs.tiers].reverse() as t (t.n)}
      <div class="tier" class:open={openTier === t.n} data-testid="cs-tier" data-n={t.n}>
        <button class="row" data-testid="cs-tier-row" onclick={() => { openTier = openTier === t.n ? null : t.n; openPart = null; }}>
          <span class="n">{t.n}</span><span class="sum">{t.summary.replace(/^\d+층 · /, '')}</span><span class="chev">{openTier === t.n ? '▾' : '▸'}</span>
        </button>
        {#if openTier === t.n}
          <div class="kids">
            {#if t.items.some((i) => i.part.items.length)}<button class="btn small" data-testid="cs-front" onclick={() => onTab('layout')}>이 층 정면도 — 글자·그림 배치</button>{/if}
            {#each t.items as it (it.part.id)}
              <div class="part" class:open={openPart === it.part.id} data-testid="cs-part" data-part={it.part.id} data-kind={it.part.kind}>
                <button class="row sub" data-testid="cs-part-row" onclick={() => (openPart = openPart === it.part.id ? null : it.part.id)}>
                  <b>{it.label}</b><span class="sum" data-testid="cs-part-sum">{layerText(it)}</span><span class="chev">{openPart === it.part.id ? '▾' : '▸'}</span>
                </button>
                {#if openPart === it.part.id}
                  <!-- 재료 층 목록 (앞이 위). 고칠 수 있으면 아래 편집기의 [재료 층]이 같은 것을 보여 주므로 보기 권한·재료 층 없는 종류만 -->
                  {#if ro || it.part.kind !== 'scashi'}<ol class="layers" data-testid="cs-layers">
                    {#each [...it.layers].reverse() as l, li (li)}<li data-testid="cs-layer">{l.label} <b>{fmtT(l.thickness)}</b></li>{/each}
                  </ol>{/if}
                  <PartsEditor {obj} {ro} {update} {kinds} partId={it.part.id} />
                  {#if !ro && componentOf(it.part.kind).host}
                    <div class="adds"><button class="btn small" data-testid="cs-add-on" onclick={() => add('sheet', it.part.id, 'sh-cut')}>+ 이 위에 시트</button></div>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    {#if cs.frame}
      <div class="tier" class:open={openTier === 1} data-testid="cs-tier" data-n="1">
        <button class="row" data-testid="cs-tier-row" onclick={() => { openTier = openTier === 1 ? null : 1; openPart = null; }}>
          <span class="n">1</span><span class="sum">프레임 — {cs.frame.label}{cs.frame.depth ? ` ${cs.frame.depth}` : ''}</span><span class="chev">{openTier === 1 ? '▾' : '▸'}</span>
        </button>
        {#if openTier === 1}
          <div class="kids">
            <button class="btn small" data-testid="cs-body" onclick={() => onTab('body')}>프레임(몸통) 종류·두께·마감</button>
            {#if !ro && addKinds.length}
              <div class="adds"><span class="hint">프레임 면 위에 올리기</span>
                {#each addKinds as k (k)}<button class="btn small" data-testid="cs-add-{k}" onclick={() => add(k)}>+ {componentOf(k).label}</button>{/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else if !ro && addKinds.length}
      <div class="adds"><span class="hint">올리기</span>{#each addKinds as k (k)}<button class="btn small" data-testid="cs-add-{k}" onclick={() => add(k, 'frame')}>+ {componentOf(k).label}</button>{/each}</div>
    {/if}
    {#if cs.extras.length}
      <div class="extras" data-testid="cs-extras"><span class="hint">부속</span>
        {#each cs.extras as p (p.id)}<button class="btn small" onclick={() => onTab(`part:${p.id}`)}>{componentOf(p.kind).label}</button>{/each}
      </div>
    {/if}
    {#if !cs.tiers.length && !cs.frame}<p class="hint">아직 쌓인 것이 없습니다.</p>{/if}
  </div>
</div>

<style>
  .cs { display: flex; flex-direction: column; gap: 10px; }
  .figure { background: var(--input); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
  .figbar { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-top: 4px; }
  .blk { cursor: pointer; }
  .blk.sel .front { stroke: var(--accent); stroke-width: 2.4; }
  .blk:hover .front { stroke: var(--accent); }
  .fold { display: flex; flex-direction: column; gap: 6px; }
  .tier { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .tier.open { border-color: var(--accent); }
  .row { width: 100%; display: flex; align-items: center; gap: 8px; background: none; border: 0; color: var(--text); font: inherit; text-align: left; padding: 9px 10px; cursor: pointer; }
  .row .n { min-width: 22px; height: 22px; border-radius: 11px; background: var(--accent); color: var(--accent-ink); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; }
  .row .sum { flex: 1; min-width: 0; color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.sub { padding: 7px 8px; }
  .row.sub b { white-space: nowrap; }
  .chev { color: var(--muted); }
  .kids { padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
  .part { border: 1px solid var(--line); border-radius: 8px; }
  .part.open { border-color: var(--accent); padding-bottom: 8px; }
  .part :global(.card), .part :global(section) { margin: 0 8px; }
  .layers { margin: 0 8px 6px; padding: 0 0 0 18px; font-size: 13px; color: var(--muted); }
  .adds, .extras { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 8px 0; }
  .hint { color: var(--muted); font-size: 12px; }
  .btn.on { border-color: var(--accent); color: var(--accent); }
</style>
