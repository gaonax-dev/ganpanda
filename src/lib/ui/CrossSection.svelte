<!--
  단면 쌓기 (재료 조합 S1, 2026-10-22 사용자: "단면 쌓기는 2.5d가 좋을것 같아", "단면 하단에 폴딩으로 속성은", "단면쌓기는 인터페이스야",
  "갈바 위에 체널과 아크릴스카시가 있다면 두개가 같은 층에 있다", "해당 층을 클릭하면 정면도로 활용 가능하다") — 설계 docs/features/material-stack.md
  · 위: 2.5D — 판을 눕혀 위로 쌓는다(간판 면 = 바닥에 누운 판, 두께 = 위로, 같은 비율). 펼침 = 위아래로 벌림. 컷팅되는 것(스카시·채널 글자)은 바운드 박스(점선) + 컷팅 모양
  · 아래: 접이 속성 — 층 줄 > 구성 요소 줄 > 재료 층·속성. 그림에서 고르면 접이가 펼쳐지고, 접이를 펼치면 그림에서 강조 (한 번에 하나)
  · 층의 [정면도] = 배치 탭(정면도 편집), 고치기는 지금의 구성 요소 편집기(PartsEditor) 그대로
-->
<script lang="ts">
  import type { SignObject, SignPart } from '../core/model';
  import { crossSection, type CsItem } from '../core/crossSection';
  import { componentOf, surfaceOf } from '../core/components';
  import { commitParts, newPart, partsOf } from '../core/parts';
  import PartsEditor from './PartsEditor.svelte';
  import FrontEditor from './FrontEditor.svelte';
  import type { PartItem } from '../core/model';
  import { layersOf, lockedItemIds } from '../core/layers';

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

  // ── 2.5D 그림: 판을 눕혀 위로 쌓는다 (2026-10-22 "레이어 쌓기가 현재 방향이 아니고 위로 쌓기고 펼침도 위아래로 벌리는 방향이다") ──
  // 간판 면(가로 x·세로 y)은 바닥에 누운 판 — x 는 그대로, y 는 비스듬히 뒤로(30°, 줄여서), 두께(z)는 위로. 아래 층부터 그려 위 층이 덮는다
  // 두께는 모든 층이 같은 비율 (2026-10-22 "각각의 레이어는 지정된 비율로 굵기도 지정값을 반영한다") — 비율은 그림 아래 "두께 ×N"
  const VW = 560, M = 14, F = 1, GAP = 22;
  const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
  const MAT_COLOR: Record<string, string> = { iron: '#8b9096', rubber: '#3b3b3f', alu: '#c4cad0', 'alu-gold': '#d4b25e', 'alu-silver': '#d9dde1', stain: '#dfe3e7', titan: '#b9a46c', acrylic: '#cfe6ff', foamex: '#f3f3f3', channel: '#eef2f6', sheet: '#7cc0ff' };
  interface Slab { item: CsItem | null; tier: number; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; color: string; side: string; /** 컷팅 모양(글자)을 그리나 */ cut: boolean; empty?: boolean }
  const draw = $derived.by(() => {
    const W = cs.width, H = cs.height;
    const s = (VW - 2 * M) / (W + H * F * COS); // mm → px (가로)
    // 층 쌓기: 프레임(0) → 올린 곳 위로. z 는 mm, 펼치면 단(level)마다 GAP px
    const slabs: (Omit<Slab, 'z0' | 'z1'> & { zm0: number; zm1: number; level: number })[] = [];
    const top = new Map<string, { zm: number; level: number }>();
    let base = { zm: 0, level: 0 };
    if (cs.frame) {
      slabs.push({ item: null, tier: 1, x0: -W / 2, x1: W / 2, y0: -H / 2, y1: H / 2, zm0: 0, zm1: cs.frame.depth || 0, level: 0, color: '#c9ced4', side: '#aab1b8', cut: false });
      base = { zm: cs.frame.depth || 0, level: 1 };
    }
    for (const t of cs.tiers) for (const it of t.items) {
      const host = it.part.on && it.part.on !== 'frame' ? top.get(it.part.on) : undefined;
      let { zm, level } = host ?? base;
      const surf = surfaceOf(it.part);
      // 글자가 있으면 컷팅 모양 — 스카시·채널·시트 커팅 모두 같게 (2026-10-22 "시트 커팅도 스카시와 같게")
      const cut = it.part.items.some((x) => x.kind === 'text' && !!x.text?.trim());
      if (!it.layers.length) slabs.push({ item: it, tier: t.n, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1, zm0: zm, zm1: zm, level, color: 'transparent', side: 'transparent', cut: false, empty: true });
      it.layers.forEach((l, i) => {
        const last = i === it.layers.length - 1;
        const c = (last && surf.face) || MAT_COLOR[l.material] || componentOf(it.part.kind).color;
        slabs.push({ item: it, tier: t.n, x0: it.x0, x1: it.x1, y0: it.y0, y1: it.y1, zm0: zm, zm1: zm + (l.thickness || 0), level, color: c, side: surf.side || shade(c), cut });
        zm += l.thickness || 0; level++;
      });
      top.set(it.part.id, { zm, level });
    }
    const Dm = Math.max(1, ...slabs.map((b) => b.zm1));
    const zs = s; // 실제 비율 — 가로·세로·두께 같은 축척 (2026-10-22 "가로 세로 두께를 적용해 사실적으로 표시해줘")
    const levels = Math.max(0, ...slabs.map((b) => b.level));
    const zTot = Dm * zs + (explode ? levels * GAP : 0);
    const out: Slab[] = slabs.map((b) => ({ ...b, z0: b.zm0 * zs + (explode ? b.level * GAP : 0), z1: b.zm1 * zs + (explode ? b.level * GAP : 0) }));
    const ox = M, oy = M + H * s * F * SIN + zTot; // 앞(가까운) 아래 모서리의 왼쪽 = 바닥선
    const P = (x: number, y: number, z: number): [number, number] => [ox + (x + W / 2) * s + (y + H / 2) * s * F * COS, oy - (y + H / 2) * s * F * SIN - z];
    const pts = (ps: [number, number][]) => ps.map((p) => p.map((v) => Math.round(v * 10) / 10).join(',')).join(' ');
    const polys = out.sort((a, b) => a.z0 - b.z0 || b.y0 - a.y0 || a.x0 - b.x0).map((b) => ({
      b,
      top: pts([P(b.x0, b.y0, b.z1), P(b.x1, b.y0, b.z1), P(b.x1, b.y1, b.z1), P(b.x0, b.y1, b.z1)]),
      front: pts([P(b.x0, b.y0, b.z1), P(b.x1, b.y0, b.z1), P(b.x1, b.y0, b.z0), P(b.x0, b.y0, b.z0)]),
      side: pts([P(b.x1, b.y0, b.z1), P(b.x1, b.y1, b.z1), P(b.x1, b.y1, b.z0), P(b.x1, b.y0, b.z0)]),
      // 판 위(z) 평면에 글자를 그리는 변환: 글자 좌표 (u 오른쪽, v 아래 = -y)
      plane: (z: number) => `matrix(${s} 0 ${-s * F * COS} ${s * F * SIN} ${ox + (W / 2) * s + (H / 2) * s * F * COS} ${oy - (H / 2) * s * F * SIN - z})`,
    }));
    // 구성 요소마다 화면 범위 (고르면 그 부분을 확대)
    const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
    for (const b of out) {
      const id = b.item?.part.id ?? 'frame';
      const ps = [P(b.x0, b.y0, b.z0), P(b.x1, b.y0, b.z0), P(b.x1, b.y1, b.z1), P(b.x0, b.y1, b.z1), P(b.x0, b.y0, b.z1), P(b.x1, b.y1, b.z0)];
      const r = boxes.get(id) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const [x, y] of ps) { r.x0 = Math.min(r.x0, x); r.y0 = Math.min(r.y0, y); r.x1 = Math.max(r.x1, x); r.y1 = Math.max(r.y1, y); }
      boxes.set(id, r);
    }
    return { polys, boxes, w: Math.ceil(ox + W * s + H * s * F * COS + M), h: Math.ceil(oy + M) };
  });
  function shade(hex: string) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '#888';
    const n = parseInt(m[1], 16), f = 0.72;
    return `#${[16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * f).toString(16).padStart(2, '0')).join('')}`;
  }
  /** 보기 범위: 전체, 또는 고른 구성 요소 둘레 (실제 비율이라 얇은 층은 확대해서 본다) */
  let zoomAll = $state(false);
  const viewBox = $derived.by(() => {
    const full = `0 0 ${draw.w} ${draw.h}`;
    const r = openPart && !zoomAll ? draw.boxes.get(openPart) : undefined;
    if (!r) return full;
    const w = Math.max(80, (r.x1 - r.x0) * 1.5), h = Math.max(50, (r.y1 - r.y0) * 1.8);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    return `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  });
  $effect(() => { void openPart; zoomAll = false; }); // 다른 것을 고르면 다시 확대
  /** 컷팅 모양 = 글자 객체 (판 평면 좌표) */
  const glyphs = (p: SignPart) => p.items.filter((i) => i.kind === 'text' && i.text?.trim());
  /** 두께를 보이게 글자를 바닥~위 사이에 몇 겹 */
  const steps = (b: Slab) => { const n = Math.min(48, Math.max(1, Math.ceil((b.z1 - b.z0) / 0.6))); return Array.from({ length: n }, (_, i) => b.z0 + ((b.z1 - b.z0) * i) / n); };

  // ── 층 정면도 (2026-10-22 "해당 층을 클릭하면 정면도로 활용 가능하다"): 그 층만 고치고, 바탕 = 올라간 면, 아래 층은 흐리게, 위 층은 숨김. part = 구성 요소 정면도 ──
  let front = $state<{ tier: number; part?: string } | null>(null);
  let frontSel = $state<{ part: string; item: string } | null>(null);
  const frontView = $derived.by(() => {
    if (!front) return null;
    const t = cs.tiers.find((x) => x.n === front!.tier);
    if (!t) return null;
    const mine = t.items.map((i) => i.part);
    const edit = front.part ? mine.filter((p) => p.id === front!.part) : mine;
    const lower = cs.tiers.filter((x) => x.n < t.n).flatMap((x) => x.items.map((i) => i.part));
    const back = [...lower, ...(front.part ? mine.filter((p) => p.id !== front!.part) : [])];
    // 올라간 면: 프레임이면 사인물 전체(바탕 없음), 구성 요소 위면 그 구성 요소들의 자리
    const hosts = [...new Set(edit.map((p) => (p.on && p.on !== 'frame' ? p.on : null)).filter((x): x is string => !!x))];
    const hostItems = cs.tiers.flatMap((x) => x.items).filter((i) => hosts.includes(i.part.id));
    const base = hostItems.length ? (() => { const x0 = Math.min(...hostItems.map((i) => i.x0)), x1 = Math.max(...hostItems.map((i) => i.x1)), y0 = Math.min(...hostItems.map((i) => i.y0)), y1 = Math.max(...hostItems.map((i) => i.y1)); return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; })() : undefined;
    const part = front.part ? t.items.find((i) => i.part.id === front!.part) : undefined;
    return { t, edit, back, base, title: part ? `${t.n}층 · ${part.label} 정면도` : `${t.n}층 정면도 — ${t.summary.replace(/^\d+층 · /, '')}` };
  });
  const locked = $derived(lockedItemIds(layersOf(obj, parts)));
  function setFrontItem(partId: string, itemId: string, patch: Partial<PartItem>) {
    const ps: SignPart[] = JSON.parse(JSON.stringify(parts));
    const it = ps.find((p) => p.id === partId)?.items.find((x) => x.id === itemId);
    if (it) { Object.assign(it, patch); update(commitParts(obj, ps)); }
  }

  function pick(item: CsItem | null, tier: number) {
    if (!item) { openTier = openTier === 1 && cs.frame ? null : 1; openPart = null; return; }
    openTier = tier; openPart = item.part.id;
  }
  const isSel = (b: Slab) => (b.item ? openPart === b.item.part.id : openTier === 1 && !!cs.frame && !openPart);

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
  {#if frontView}
    <div class="tierfront" data-testid="cs-tier-front">
      <div class="frontbar">
        <button class="btn small" data-testid="cs-front-back" onclick={() => { front = null; frontSel = null; }}>← 단면</button>
        {#if front?.part}<button class="btn small" data-testid="cs-front-up" onclick={() => { front = { tier: front!.tier }; frontSel = null; }}>← {front.tier}층</button>{/if}
        <b data-testid="cs-front-title">{frontView.title}</b>
      </div>
      <FrontEditor {obj} parts={frontView.edit} back={frontView.back} base={frontView.base} areas {ro} bind:sel={frontSel} setItem={setFrontItem} {locked} title={front?.part ? '구성 요소 정면도' : '층 정면도'} />
      {#if !front?.part && frontView.t.items.length > 1}
        <div class="adds"><span class="hint">구성 요소 하나만</span>
          {#each frontView.t.items as it (it.part.id)}<button class="btn small" data-testid="cs-front-part" onclick={() => { front = { tier: frontView.t.n, part: it.part.id }; frontSel = null; }}>{it.label}</button>{/each}
        </div>
      {/if}
      <p class="hint">아래 층은 흐리게, 위 층은 숨깁니다. 바탕(점선) = 이 층이 올라간 면 — 정렬·붙이기 기준</p>
    </div>
  {:else}
  <div class="figure">
    <svg data-testid="cs-figure" viewBox={viewBox} width="100%" style:max-height="320px" role="img" aria-label="단면 쌓기">
      {#each draw.polys as p, i (i)}
        {@const b = p.b}
        <g class="blk" class:sel={isSel(b)} data-testid="cs-block" data-tier={b.tier} data-part={b.item?.part.id ?? 'frame'} role="button" tabindex="-1"
          onclick={() => pick(b.item, b.tier)} onkeydown={(e) => { if (e.key === 'Enter') pick(b.item, b.tier); }}>
          {#if b.empty}
            <!-- 재료가 아직 없는 스카시: 바운드 박스만 -->
            <polygon class="bbox" points={p.top} fill="#00000008" stroke="#0009" stroke-dasharray="4 3" stroke-width="1" />
          {:else if b.cut && b.item}
            <!-- 바운드 박스(점선) + 컷팅된 모양(글자)을 함께 (2026-10-22 "스카시의 경우 바운드 박스와 커팅된 상태가 같이 나오게") -->
            <polygon class="bbox" points={p.front} fill="none" stroke="#0007" stroke-dasharray="3 3" stroke-width="0.8" />
            <polygon class="bbox" points={p.side} fill="none" stroke="#0007" stroke-dasharray="3 3" stroke-width="0.8" />
            {#each steps(b) as z (z)}
              {#each glyphs(b.item.part) as g (g.id)}
                <text transform={p.plane(z)} x={g.x} y={-g.y} font-size={g.h} font-weight="800" text-anchor="middle" dominant-baseline="central" fill={b.side} pointer-events="none">{g.text}</text>
              {/each}
            {/each}
            {#each glyphs(b.item.part) as g (g.id)}
              <text class="cutface" transform={p.plane(b.z1)} x={g.x} y={-g.y} font-size={g.h} font-weight="800" text-anchor="middle" dominant-baseline="central" fill={b.color} stroke="#0007" stroke-width={g.h * 0.02} pointer-events="none">{g.text}</text>
            {/each}
            <polygon class="bbox top" points={p.top} fill="#00000006" stroke="#000a" stroke-dasharray="4 3" stroke-width="1" />
          {:else}
            <polygon points={p.front} fill={b.side} stroke="#0006" stroke-width="0.6" />
            <polygon points={p.side} fill={shade(b.side)} stroke="#0006" stroke-width="0.6" />
            <polygon class="face" points={p.top} fill={b.color} fill-opacity={b.item && !b.cut && b.z1 - b.z0 < 1 ? 0.75 : 1} stroke="#0008" stroke-width="0.8" />
          {/if}
        </g>
      {/each}
    </svg>
    <div class="figbar">
      <span class="hint" data-testid="cs-ratio">실제 비율 — 가로·세로·두께 같은 축척 · 층을 누르면 그 부분을 확대하고 아래 속성이 펼쳐집니다</span>
      {#if openPart && !zoomAll}<button class="btn small" data-testid="cs-zoom-all" onclick={() => (zoomAll = true)}>전체</button>{/if}
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
            <button class="btn small" data-testid="cs-front" onclick={() => { front = { tier: t.n }; frontSel = null; }}>이 층 정면도 — 자리·배치</button>
            {#each t.items as it (it.part.id)}
              <div class="part" class:open={openPart === it.part.id} data-testid="cs-part" data-part={it.part.id} data-kind={it.part.kind}>
                <button class="row sub" data-testid="cs-part-row" onclick={() => (openPart = openPart === it.part.id ? null : it.part.id)}>
                  <b>{it.label}</b><span class="sum" data-testid="cs-part-sum">{layerText(it)}</span><span class="chev">{openPart === it.part.id ? '▾' : '▸'}</span>
                </button>
                {#if openPart === it.part.id}
                  <!-- 재료 층 목록 (앞이 위). 고칠 수 있으면 아래 편집기의 [재료 층]이 같은 것을 보여 주므로 보기 권한·재료 층 없는 종류만 -->
                  {#if ro || !componentOf(it.part.kind).stack}<ol class="layers" data-testid="cs-layers">
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
  {/if}
</div>

<style>
  .cs { display: flex; flex-direction: column; gap: 10px; }
  /* 그림은 밝은 도면 바탕 (어두운 재료도 보이게) */
  .figure { background: var(--input); border: 1px solid var(--line); border-radius: 10px; padding: 8px; }
  .figure svg { background: #eef1f4; border-radius: 6px; }
  .figbar { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-top: 4px; }
  .blk { cursor: pointer; }
  .blk.sel .face, .blk.sel .bbox.top { stroke: var(--accent); stroke-width: 2.4; stroke-dasharray: none; }
  .blk.sel .cutface { stroke: var(--accent); }
  .blk:hover .face, .blk:hover .bbox.top { stroke: var(--accent); }
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
  .tierfront { display: flex; flex-direction: column; gap: 6px; }
  .frontbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .adds, .extras { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 8px 0; }
  .hint { color: var(--muted); font-size: 12px; }
  .btn.on { border-color: var(--accent); color: var(--accent); }
</style>
