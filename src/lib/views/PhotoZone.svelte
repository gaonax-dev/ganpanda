<!-- 사진 = 보드 위의 구역. 사인물 영역(사각·원형)을 그리고 편집한다. 좌표는 사진 원본 픽셀. -->
<script lang="ts">
  import type { Pt } from '../core/homography';
  import type { Photo, SignObject, ShapeKind } from '../core/model';
  import type { MeasureResult } from '../core/measure';
  import { ellipseInQuad, quadFromDrag } from '../core/perspective';
  import type { Tool } from '../state.svelte';

  let {
    photo, url, zoom, objects, measures, selectedId, tool, editable = true,
    toPhoto, oncreate, onselect, onquad, onmove, ondelete,
  }: {
    /** false = 보기 전용 (영역 이동·모서리·사진 이동·삭제 불가) */
    editable?: boolean;
    photo: Photo;
    url?: string;
    zoom: number;
    objects: SignObject[];
    measures: Map<string, MeasureResult>;
    selectedId: string | null;
    tool: Tool;
    toPhoto: (cx: number, cy: number) => Pt;
    oncreate: (shape: ShapeKind, quad: Pt[]) => void;
    onselect: (id: string | null) => void;
    onquad: (id: string, quad: Pt[]) => void;
    onmove: (dx: number, dy: number) => void;
    ondelete: () => void;
  } = $props();

  const scale = $derived(photo.width / photo.w);
  /** 화면 1px 에 해당하는 사진 픽셀 */
  const u = $derived(1 / (scale * zoom));
  const worldH = $derived(photo.width * (photo.h / photo.w));

  let draft: { start: Pt; end: Pt } | null = $state(null);
  /** 편집 중인 오브젝트의 임시 사각형 (pointerup 에 문서 반영) */
  let editing: { id: string; quad: Pt[]; mode: number | 'move'; from: Pt; orig: Pt[] } | null = $state(null);

  const drawShape = $derived<ShapeKind>(tool === 'ellipse' ? 'ellipse' : 'rect');
  const quadOf = (o: SignObject) => (editing?.id === o.id ? editing.quad : o.quad);
  const outline = (shape: ShapeKind, quad: Pt[], poly?: Pt[]) =>
    (shape === 'ellipse' ? ellipseInQuad(quad) : shape === 'polygon' && poly ? poly : quad).map((p) => p.join(',')).join(' ');
  const clamp = ([x, y]: Pt): Pt => [Math.max(0, Math.min(photo.w, x)), Math.max(0, Math.min(photo.h, y))];
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  function bgDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (tool === 'select') { onselect(null); return; } // 이벤트 전파 → 캔버스 이동
    e.stopPropagation();
    const p = clamp(toPhoto(e.clientX, e.clientY));
    draft = { start: p, end: p };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function shapeDown(e: PointerEvent, o: SignObject, mode: number | 'move') {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselect(o.id);
    if (!editable || (tool !== 'select' && mode === 'move')) return;
    editing = { id: o.id, quad: o.quad, mode, from: toPhoto(e.clientX, e.clientY), orig: o.quad };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (draft) { draft = { ...draft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (!editing) return;
    const [x, y] = toPhoto(e.clientX, e.clientY);
    const dx = x - editing.from[0], dy = y - editing.from[1];
    editing.quad = editing.mode === 'move'
      ? editing.orig.map(([a, b]) => [a + dx, b + dy] as Pt)
      : editing.orig.map((p, i) => (i === editing!.mode ? clamp([p[0] + dx, p[1] + dy]) : p));
  }

  function up() {
    if (draft) {
      const q = quadFromDrag(draft.start, draft.end);
      if ((q[1][0] - q[0][0]) / u > 8 && (q[2][1] - q[1][1]) / u > 8) oncreate(drawShape, q);
      draft = null;
    }
    if (editing) {
      if (editing.quad !== editing.orig) onquad(editing.id, editing.quad);
      editing = null;
    }
  }

  // 헤더(사진 이름 바) 드래그로 사진 구역 이동
  let headerDrag: { x: number; y: number } | null = null;
  function headerDown(e: PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    headerDrag = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function headerMove(e: PointerEvent) {
    if (!headerDrag) return;
    onmove((e.clientX - headerDrag.x) / zoom, (e.clientY - headerDrag.y) / zoom);
    headerDrag = { x: e.clientX, y: e.clientY };
  }
</script>

<div class="zone" data-testid="photo-zone" style:left="{photo.x}px" style:top="{photo.y}px" style:width="{photo.width}px" style:height="{worldH}px">
  <div
    class="header"
    style:transform="scale({1 / zoom})"
    style:width="{photo.width * zoom}px"
    role="toolbar"
    tabindex="-1"
    onpointerdown={headerDown}
    onpointermove={headerMove}
    onpointerup={() => (headerDrag = null)}
  >
    <span class="name">{photo.name}</span>
    <span class="count">사인물 {objects.length}</span>
    {#if editable}<button class="x" title="사진 삭제" onpointerdown={(e) => e.stopPropagation()} onclick={ondelete}>✕</button>{/if}
  </div>
  {#if url}
    <img src={url} alt={photo.name} data-testid="photo-img" draggable="false" />
  {:else}
    <div class="loading">불러오는 중…</div>
  {/if}
  <svg
    viewBox="0 0 {photo.w} {photo.h}"
    class:drawing={tool !== 'select'}
    data-bg={tool === 'select' ? '' : undefined}
    role="presentation"
    onpointerdown={bgDown}
    onpointermove={move}
    onpointerup={up}
  >
    {#each objects as o (o.id)}
      {@const q = quadOf(o)}
      {@const m = measures.get(o.id)}
      {@const sel = o.id === selectedId}
      {@const warn = (m?.warnings.length ?? 0) > 0}
      <g class="sign" class:sel class:warn>
        <polygon
          data-testid="sign-shape"
          data-shape={o.shape}
          points={outline(o.shape, q, o.polygon)}
          stroke-width={2 * u}
          role="button"
          tabindex="-1"
          onpointerdown={(e) => shapeDown(e, o, 'move')}
        />
        <text x={q[0][0]} y={q[0][1] - 6 * u} font-size={12 * u} stroke-width={3 * u}>
          {#if warn}<tspan data-testid="sign-warning-icon" class="w">⚠ </tspan>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}
        </text>
        {#if sel && editable && tool === 'select'}
          {#each q as p, i (i)}
            <circle class="handle" cx={p[0]} cy={p[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => shapeDown(e, o, i)} />
          {/each}
        {/if}
      </g>
    {/each}
    {#if draft}
      <polygon class="draft" points={outline(drawShape, quadFromDrag(draft.start, draft.end))} stroke-width={2 * u} stroke-dasharray="{6 * u} {4 * u}" />
    {/if}
  </svg>
</div>

<style>
  .zone { position: absolute; box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35); background: #222; }
  img, .loading { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .loading { display: grid; place-items: center; color: #999; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  svg.drawing { cursor: crosshair; }
  .header {
    position: absolute; left: 0; bottom: 100%; transform-origin: 0 100%; height: 30px;
    display: flex; align-items: center; gap: 8px; padding: 0 2px; cursor: move; color: var(--muted); font-size: 13px;
  }
  .header .name { color: var(--text); font-weight: 600; }
  .header .x { margin-left: auto; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 13px; }
  .sign polygon { fill: rgba(47, 139, 255, 0.12); stroke: var(--blue); cursor: pointer; }
  .sign.warn polygon { stroke: var(--warn); fill: rgba(255, 170, 0, 0.12); }
  .sign.sel polygon { fill: rgba(255, 204, 0, 0.16); stroke: var(--accent); }
  .sign text { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  .sign text .w { fill: var(--warn); }
  .handle { fill: #fff; stroke: var(--accent); cursor: grab; }
  .draft { fill: rgba(255, 204, 0, 0.12); stroke: var(--accent); pointer-events: none; }
</style>
