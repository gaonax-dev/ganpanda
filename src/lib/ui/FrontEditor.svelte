<!--
  조합형 3단계: 설정 창 안 정면도 편집기 (2026-10-16 사용자: 정면도 편집기는 "2" — 설정 창 안에 따로).
  사인물 프레임(가로×세로) 위에 구성 요소의 글자·그림 객체를 실측 비율로 그리고, 끌어 옮기기·모서리로 크기(비율 유지)·정렬·방향키로 다룬다.
  끄는 동안은 화면에서만 움직이고 놓을 때 한 번 저장한다(실행 취소 한 단계). Alt 를 누르고 끌면 붙지 않는다.
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { itemAssetId } from '../render/itemImages';
  import type { PartItem, SignObject, SignPart } from '../core/model';
  import { PART_COLOR as COLOR } from '../core/partsLayout';
  import { layerOrder } from '../core/parts';
  import { SNAP_PX, alignBox, frameBox, itemBox, resizeItem, snapMove, viewOf, type Align, type Box } from '../core/frontView';

  type Sel = { part: string; item: string } | null;
  let { obj, parts, ro, sel = $bindable(), setItem }: {
    obj: SignObject; parts: SignPart[]; ro: boolean; sel: Sel;
    setItem: (partId: string, itemId: string, patch: Partial<PartItem>) => void;
  } = $props();

  /** 정면도 높이(px): 사인물 비율에 맞추되 이 범위 안 — 가로로 긴 간판에서 창을 덜 차지하게 */
  const VIEW_H_MIN = 120, VIEW_H_MAX = 240;
  const PAD_PX = 16;
  /** 방향키 한 번 (mm), Shift 와 함께 */
  const NUDGE_MM = 10, NUDGE_BIG_MM = 100;

  let viewW = $state(480);
  let svg = $state<SVGSVGElement>();
  const frame = $derived(frameBox(obj));
  const hasSize = $derived(!!(obj.widthMm && obj.heightMm));
  const VIEW_H = $derived(hasSize ? Math.round(Math.min(VIEW_H_MAX, Math.max(VIEW_H_MIN, (viewW - 2 * PAD_PX) * (frame.h / frame.w) + 2 * PAD_PX))) : VIEW_H_MAX);
  const all = $derived(layerOrder(parts).flatMap((p) => p.items.map((it) => ({ p, it, box: itemBox(it) }))));
  // 축척은 저장된 값으로만 — 끄는 동안 화면이 출렁이지 않게
  const view = $derived(viewOf(frame, all.map((a) => a.box), viewW, VIEW_H, PAD_PX));

  /** 끄는 중: 옮기기 또는 크기 */
  let drag = $state<{ mode: 'move' | 'resize'; part: string; item: string; start: [number, number]; box: Box; it: PartItem; cur: Partial<PartItem>; guides: { axis: 'x' | 'y'; at: number }[] } | null>(null);
  const shown = (p: SignPart, it: PartItem): PartItem => (drag && drag.part === p.id && drag.item === it.id ? { ...it, ...drag.cur } : it);

  /** 그림 주소 (디자인 파일 페이지 · 올린 그림) */
  let urls = $state<Record<string, string>>({});
  const assetOf = (it: PartItem): string | undefined => (it.image ? itemAssetId(it.image, app.sources) : undefined);
  $effect(() => {
    for (const { it } of all) {
      const id = assetOf(it);
      if (id && !urls[id]) assetUrl(id).then((u) => { if (u) urls = { ...urls, [id]: u }; });
    }
  });

  const mmAt = (e: PointerEvent): [number, number] => {
    const r = svg!.getBoundingClientRect();
    return view.toMm([e.clientX - r.left, e.clientY - r.top]);
  };
  function down(e: PointerEvent, p: SignPart, it: PartItem, mode: 'move' | 'resize') {
    sel = { part: p.id, item: it.id };
    svg?.focus();
    if (ro) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { mode, part: p.id, item: it.id, start: mmAt(e), box: itemBox(it), it, cur: {}, guides: [] };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const [x, y] = mmAt(e);
    const d = drag;
    if (d.mode === 'move') {
      const box = { ...d.box, x: d.box.x + x - d.start[0], y: d.box.y + y - d.start[1] };
      const others = all.filter((a) => a.it.id !== d.item).map((a) => a.box);
      const s = e.altKey ? { x: Math.round(box.x), y: Math.round(box.y), guides: [] } : snapMove(box, frame, others, SNAP_PX / view.scale);
      drag = { ...d, cur: { x: s.x, y: s.y }, guides: s.guides };
    } else {
      // 중심에서 손잡이까지 거리의 비율만큼 (비율 유지)
      const dist = (p: [number, number]) => Math.hypot(p[0] - d.box.x, p[1] - d.box.y);
      const k = dist([x, y]) / Math.max(1, dist(d.start));
      drag = { ...d, cur: resizeItem(d.it, d.it.h * k), guides: [] };
    }
  }
  function up() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (Object.keys(d.cur).length) setItem(d.part, d.item, d.cur);
  }

  const selected = $derived(all.find((a) => sel && a.p.id === sel.part && a.it.id === sel.item));
  function align(how: Align) {
    if (!selected) return;
    setItem(selected.p.id, selected.it.id, alignBox(selected.box, frame, how));
  }
  function key(e: KeyboardEvent) {
    if (!selected || ro) return;
    const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation(); // 보드 단축키로 가지 않게
    setItem(selected.p.id, selected.it.id, { x: selected.it.x + d[0], y: selected.it.y + d[1] });
  }
  const ALIGNS: { how: Align; label: string; title: string }[] = [
    { how: 'left', label: '⇤', title: '왼쪽 맞춤' }, { how: 'center', label: '↔', title: '가로 가운데' }, { how: 'right', label: '⇥', title: '오른쪽 맞춤' },
    { how: 'top', label: '⤒', title: '위 맞춤' }, { how: 'middle', label: '↕', title: '세로 가운데' }, { how: 'bottom', label: '⤓', title: '아래 맞춤' },
  ];
  const rectOf = (b: Box) => {
    const [x0, y0] = view.toView([b.x - b.w / 2, b.y + b.h / 2]);
    return { x: x0, y: y0, w: b.w * view.scale, h: b.h * view.scale };
  };
  const fr = $derived(rectOf({ ...frame, w: frame.w || 1000, h: frame.h || 1000 }));
</script>

<div class="front" data-testid="front-editor" bind:clientWidth={viewW}>
  <div class="bar">
    <span class="title">정면도</span>
    <span class="hint">{hasSize ? `${obj.widthMm}×${obj.heightMm}mm` : '치수를 넣으면 실제 비율로 보입니다'} · 끌어 옮기기, 모서리로 크기, 방향키 10mm(Shift 100mm), Alt 끌기 = 붙지 않음</span>
    {#if !ro}
      <span class="aligns">
        {#each ALIGNS as a (a.how)}<button class="icon" data-testid="align-{a.how}" title={a.title} disabled={!selected} onclick={() => align(a.how)}>{a.label}</button>{/each}
      </span>
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg bind:this={svg} data-testid="front-svg" width={viewW} height={VIEW_H} tabindex="0" role="application" aria-label="정면도"
    onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={key}
    onpointerdown={(e) => { if (e.target === e.currentTarget) sel = null; }}>
    <rect data-testid="front-frame" class="frame" class:nosize={!hasSize} x={fr.x} y={fr.y} width={fr.w} height={fr.h} />
    {#each layerOrder(parts) as p (p.id)}
      {#each p.items as it0 (it0.id)}
        {@const it = shown(p, it0)}
        {@const r = rectOf(itemBox(it))}
        {@const isSel = !!sel && sel.part === p.id && sel.item === it.id}
        {@const url = urls[assetOf(it) ?? '']}
        <g data-testid="front-item" data-selected={isSel} class="item" class:ro role="button" tabindex="-1" aria-label={it.text || '그림'}
          onpointerdown={(e) => down(e, p, it0, 'move')}>
          {#if it.kind === 'text'}
            <rect class="box" x={r.x} y={r.y} width={r.w} height={r.h} style:stroke={COLOR[p.kind]} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} font-size={r.h * 0.9} textLength={r.w * 0.96} lengthAdjust="spacingAndGlyphs" fill={COLOR[p.kind]}>{it.text || '글자'}</text>
          {:else if url}
            <image href={url} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
            <rect class="box" x={r.x} y={r.y} width={r.w} height={r.h} style:stroke={COLOR[p.kind]} />
          {:else}
            <rect class="box img" x={r.x} y={r.y} width={r.w} height={r.h} style:stroke={COLOR[p.kind]} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} font-size={Math.min(12, r.h * 0.5)} fill={COLOR[p.kind]}>그림</text>
          {/if}
          {#if isSel}
            <rect class="selbox" x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} />
            {#if !ro}
              <rect data-testid="front-resize" class="handle" x={r.x + r.w - 4} y={r.y + r.h - 4} width="10" height="10"
                role="button" tabindex="-1" aria-label="크기" onpointerdown={(e) => down(e, p, it0, 'resize')} />
            {/if}
          {/if}
        </g>
      {/each}
    {/each}
    {#each drag?.guides ?? [] as g, k (k)}
      {#if g.axis === 'x'}
        {@const x = view.toView([g.at, 0])[0]}<line data-testid="front-guide" class="guide" x1={x} x2={x} y1="0" y2={VIEW_H} />
      {:else}
        {@const y = view.toView([0, g.at])[1]}<line data-testid="front-guide" class="guide" x1="0" x2={viewW} y1={y} y2={y} />
      {/if}
    {/each}
  </svg>
</div>

<style>
  /* 카드를 고치는 동안에도 보이게 설정 창 본문 위에 붙어 있다 */
  .front { position: sticky; top: 0; z-index: 2; margin: 6px 0 10px; padding: 4px 0 6px; background: var(--panel, #1b1f26); }
  .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .title { font-size: 12px; font-weight: 600; }
  .hint { font-size: 11px; color: var(--muted, #8b93a3); flex: 1; min-width: 160px; }
  .aligns { display: flex; gap: 2px; }
  .aligns .icon { width: 26px; height: 24px; padding: 0; }
  svg { display: block; background: var(--bg, #14171c); border: 1px solid var(--line, #2a2f37); border-radius: 8px; touch-action: none; outline: none; }
  svg:focus-visible { border-color: var(--accent, #5aa8ff); }
  .frame { fill: rgba(255, 255, 255, 0.04); stroke: var(--muted, #8b93a3); stroke-width: 1; }
  .frame.nosize { stroke-dasharray: 4 3; }
  .item { cursor: move; }
  .item.ro { cursor: pointer; }
  .box { fill: transparent; stroke-width: 1; stroke-dasharray: 3 2; }
  .box.img { fill: rgba(255, 255, 255, 0.06); }
  text { text-anchor: middle; dominant-baseline: central; user-select: none; pointer-events: none; }
  .selbox { fill: none; stroke: var(--accent, #5aa8ff); stroke-width: 1.5; pointer-events: none; }
  .handle { fill: var(--accent, #5aa8ff); cursor: nwse-resize; }
  .guide { stroke: #ff3bd4; stroke-width: 1; stroke-dasharray: 4 3; pointer-events: none; }
</style>
