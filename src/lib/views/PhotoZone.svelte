<!-- 사진 = 보드 위의 구역. 사인물 영역(사각·원형)을 그리고 편집한다. 좌표는 사진 원본 픽셀. -->
<script lang="ts">
  import type { Pt } from '../core/homography';
  import type { Photo, Pin, SignObject, ShapeKind } from '../core/model';
  import { colorFor } from '../core/presence';
  import type { MeasureResult } from '../core/measure';
  import { ellipseInQuad, quadFromDrag } from '../core/perspective';
  import type { Tool } from '../state.svelte';

  let {
    photo, url, zoom, objects, measures, selectedId, tool, editable = true, unread = {},
    pins = [], selectedPinId = null, oncreatepin, onselectpin, onmovepin, onpinmoveend,
    segmentState, hoverPolygon = null, onmagicenter, onmagichover, onmagicleave, onmagicclick,
    toPhoto, oncreate, onselect, onquad, onmove, ondelete,
  }: {
    pins?: Pin[];
    selectedPinId?: string | null;
    /** 핀 도구로 사진을 눌렀을 때 (viewer 도 가능) */
    oncreatepin?: (x: number, y: number) => void;
    onselectpin?: (id: string | null) => void;
    onmovepin?: (id: string, x: number, y: number) => void;
    onpinmoveend?: () => void;
    /** 자동 분리: 사진 분석 상태·호버 윤곽·이벤트 */
    segmentState?: 'embedding' | 'ready' | 'error';
    hoverPolygon?: Pt[] | null;
    onmagicenter?: () => void;
    onmagichover?: (x: number, y: number) => void;
    onmagicleave?: () => void;
    onmagicclick?: () => void;
    /** false = 보기 전용 (영역 이동·모서리·사진 이동·삭제 불가) */
    editable?: boolean;
    /** 사인물별 안 읽은 메시지 수 */
    unread?: Record<string, number>;
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

  let pinDrag: { id: string; moved: boolean } | null = null;
  function pinDown(e: PointerEvent, pin: Pin) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselectpin?.(pin.id);
    if (!editable) return;
    pinDrag = { id: pin.id, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function pinMove(e: PointerEvent) {
    if (!pinDrag) return;
    const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
    pinDrag.moved = true;
    onmovepin?.(pinDrag.id, Math.round(x), Math.round(y));
  }
  function pinUp() { if (pinDrag?.moved) onpinmoveend?.(); pinDrag = null; }

  let magicTimer = 0;
  function magicMove(e: PointerEvent) {
    if (tool !== 'magic' || magicTimer) return;
    magicTimer = window.setTimeout(() => {
      magicTimer = 0;
      const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
      onmagichover?.(x, y);
    }, 60);
  }

  function bgDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (tool === 'magic') { e.stopPropagation(); onmagicclick?.(); return; }
    if (tool === 'pin') {
      e.stopPropagation();
      const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
      oncreatepin?.(x, y);
      return;
    }
    if (tool === 'select') { onselect(null); onselectpin?.(null); return; } // 이벤트 전파 → 캔버스 이동
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
    class:pinning={tool === 'pin'}
    class:magicking={tool === 'magic'}
    data-bg={tool === 'select' ? '' : undefined}
    role="presentation"
    onpointerdown={bgDown}
    onpointermove={(e) => { move(e); magicMove(e); }}
    onpointerup={up}
    onpointerenter={() => { if (tool === 'magic') onmagicenter?.(); }}
    onpointerleave={() => { if (tool === 'magic') onmagicleave?.(); }}
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
          pointer-events={tool === 'magic' ? 'none' : 'auto'}
          onpointerdown={(e) => shapeDown(e, o, 'move')}
        />
        <text x={q[0][0]} y={q[0][1] - 6 * u} font-size={12 * u} stroke-width={3 * u}>
          {#if warn}<tspan data-testid="sign-warning-icon" class="w">⚠ </tspan>{/if}{#if unread[o.id]}<tspan data-testid="sign-unread" class="u">💬 {unread[o.id]} </tspan>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}
        </text>
        {#if sel && editable && tool === 'select'}
          {#each q as p, i (i)}
            <circle class="handle" cx={p[0]} cy={p[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => shapeDown(e, o, i)} />
          {/each}
        {/if}
      </g>
    {/each}
    {#each pins as pin (pin.id)}
      {@const r = 11 * u}
      <g class="pin" class:sel={pin.id === selectedPinId} class:resolved={pin.resolved} data-testid="pin" data-resolved={pin.resolved}
        role="button" tabindex="-1" transform="translate({pin.x} {pin.y})"
        onpointerdown={(e) => pinDown(e, pin)} onpointermove={pinMove} onpointerup={pinUp}>
        <path d="M0 0 L{-r * 0.9} {-r * 1.6} A{r * 1.25} {r * 1.25} 0 1 1 {r * 0.9} {-r * 1.6} Z" fill={colorFor(pin.author)} stroke="#fff" stroke-width={1.5 * u} />
        <text y={-r * 1.9} font-size={r * 1.1} text-anchor="middle" fill="#fff" font-weight="700">{pin.number}</text>
        {#if unread[pin.id]}
          <g transform="translate({r * 1.6} {-r * 3.2})">
            <circle r={r * 0.8} fill="var(--accent)" />
            <text data-testid="pin-unread" font-size={r * 0.9} text-anchor="middle" dy={r * 0.32} fill="#1a1500" font-weight="800">{unread[pin.id]}</text>
          </g>
        {/if}
      </g>
    {/each}
    {#if tool === 'magic' && hoverPolygon}
      <polygon class="magic" data-testid="magic-preview" points={hoverPolygon.map((p) => p.join(',')).join(' ')} stroke-width={2 * u} />
    {/if}
    {#if tool === 'magic' && segmentState === 'embedding'}
      <text class="status" data-testid="photo-ai-status" x={photo.w / 2} y={photo.h / 2} font-size={18 * u} text-anchor="middle" stroke-width={4 * u}>AI 가 사진을 분석하는 중…</text>
    {/if}
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
  svg.pinning { cursor: copy; }
  .pin { cursor: pointer; }
  .pin.resolved { opacity: 0.4; }
  .pin.sel path { stroke: var(--accent); }
  .pin text { pointer-events: none; }
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
  .sign text .u { fill: var(--accent); }
  .handle { fill: #fff; stroke: var(--accent); cursor: grab; }
  .draft { fill: rgba(255, 204, 0, 0.12); stroke: var(--accent); pointer-events: none; }
  .magic { fill: rgba(47, 139, 255, 0.28); stroke: #7fd3ff; pointer-events: none; }
  .status { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  svg.magicking { cursor: cell; }
</style>
