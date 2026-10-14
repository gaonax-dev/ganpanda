<!-- 사진 = 보드 위의 구역. 사인물 영역(사각·원형)을 그리고 편집한다. 좌표는 사진 원본 픽셀. -->
<script lang="ts">
  import type { Pt } from '../core/homography';
  import type { Photo, Pin, SignObject, ShapeKind } from '../core/model';
  import { colorFor } from '../core/presence';
  import { midpoints, zonesOf } from '../core/zone';
  import { AXIS_COLOR, REF_COLOR, pairAxes, refLineOf, solveCamera } from '../core/camera';
  import type { MeasureResult } from '../core/measure';
  import { cssMatrix3d, ellipseInQuad, quadFromDrag, rectToQuad, roundedInQuad } from '../core/perspective';
  import DesignFace from '../ui/DesignFace.svelte';
  import type { Tool } from '../state.svelte';

  let {
    photo, url, zoom, objects, measures, selectedId, sameIds = [], tool, editable = true, unread = {},
    pins = [], selectedPinId = null, oncreatepin, onselectpin, onmovepin, onpinmoveend,
    segmentState, hoverPolygon = null, onmagicenter, onmagichover, onmagicleave, onmagicclick,
    zoneSel, oncreatezone, onselectzone, onmovezonevertex, onzonemoveend, onaddzonevertex,
    toPhoto, oncreate, onselect, onquad, onmove, ondelete, onrender, oncamera, cameraSet = false, threeD = 'none',
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
    /** 작업 존 선택: undefined = 없음, { zone, vertex(null = 존만) } */
    zoneSel?: { zone: number; vertex: number | null };
    oncreatezone?: (zone: Pt[]) => void;
    /** zone = null 이면 선택 해제 */
    onselectzone?: (zone: number | null, vertex: number | null) => void;
    onmovezonevertex?: (zone: number, index: number, p: Pt) => void;
    onzonemoveend?: () => void;
    onaddzonevertex?: (zone: number, edge: number, p: Pt) => void;
    /** false = 보기 전용 (영역 이동·모서리·사진 이동·삭제 불가) */
    editable?: boolean;
    /** 사인물별 안 읽은 메시지 수 */
    unread?: Record<string, number>;
    /** 선택한 사인물과 같은 사인물(다른 사진) — 핸들 없이 하이라이트만 */
    sameIds?: string[];
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
    onrender?: () => void;
    /** 사진 원근 맞추기(카메라 설정) 창 열기. cameraSet = 이 사진에 설정이 있음 */
    oncamera?: () => void;
    cameraSet?: boolean;
    /** 이 사진에 3D 벽면이 있는가 (원근 설정 또는 치수 입력 사인물) */
    threeD?: 'ok' | 'none';
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
  /** 영역 윤곽 (사진 px): 둥근 사각 / 옛 타원 / 다각형 / 사각 */
  const outlinePts = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number): Pt[] =>
    shape === 'ellipse' ? ellipseInQuad(quad) : shape === 'polygon' && poly ? poly : corner ? roundedInQuad(quad, corner) : quad;
  const outline = (shape: ShapeKind, quad: Pt[], poly?: Pt[], corner?: number) => outlinePts(shape, quad, poly, corner).map((p) => p.join(',')).join(' ');
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

  // ---- 작업 존 (여러 개) ----
  const zones = $derived(zonesOf(photo));
  let zoneDraft: { start: Pt; end: Pt } | null = $state(null);
  let zoneDrag: { zone: number; index: number; moved: boolean } | null = null;
  function zoneDown(e: PointerEvent, zi: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tool === 'zone' && editable) { // 존 도구로 존 위를 눌러도 새로 그린다
      const p = clamp(toPhoto(e.clientX, e.clientY));
      zoneDraft = { start: p, end: p };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    onselectzone?.(zi, null);
  }
  function zoneVertexDown(e: PointerEvent, zi: number, i: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onselectzone?.(zi, i);
    if (!editable) return;
    zoneDrag = { zone: zi, index: i, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function zoneVertexMove(e: PointerEvent) {
    if (!zoneDrag) return;
    zoneDrag.moved = true;
    const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
    onmovezonevertex?.(zoneDrag.zone, zoneDrag.index, [Math.round(x), Math.round(y)]);
  }
  function zoneVertexUp() { if (zoneDrag?.moved) onzonemoveend?.(); zoneDrag = null; }
  function zoneMidDown(e: PointerEvent, zi: number, edge: number, p: Pt) {
    if (e.button !== 0 || !editable) return;
    e.stopPropagation();
    onaddzonevertex?.(zi, edge, [Math.round(p[0]), Math.round(p[1])]);
  }
  /** 존 밖을 어둡게: 사진 전체 사각형 + 존 구멍들 (evenodd) */
  const dimPath = $derived(zones.length ? `M0 0H${photo.w}V${photo.h}H0Z ` + zones.map((z) => `M${z.map((p) => p.join(' ')).join(' L')}Z`).join(' ') : '');

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
    if (tool === 'zone') {
      if (!editable) return;
      e.stopPropagation();
      const p = clamp(toPhoto(e.clientX, e.clientY));
      zoneDraft = { start: p, end: p };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'magic') { e.stopPropagation(); onmagicclick?.(); return; }
    if (tool === 'pin') {
      e.stopPropagation();
      const [x, y] = clamp(toPhoto(e.clientX, e.clientY));
      oncreatepin?.(x, y);
      return;
    }
    if (tool === 'select') { onselect(null); onselectpin?.(null); onselectzone?.(null, null); return; } // 이벤트 전파 → 캔버스 이동
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
    if (zoneDraft) { zoneDraft = { ...zoneDraft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (draft) { draft = { ...draft, end: clamp(toPhoto(e.clientX, e.clientY)) }; return; }
    if (!editing) return;
    const [x, y] = toPhoto(e.clientX, e.clientY);
    const dx = x - editing.from[0], dy = y - editing.from[1];
    editing.quad = editing.mode === 'move'
      ? editing.orig.map(([a, b]) => [a + dx, b + dy] as Pt)
      : editing.orig.map((p, i) => (i === editing!.mode ? clamp([p[0] + dx, p[1] + dy]) : p));
  }

  function up() {
    if (zoneDraft) {
      const q = quadFromDrag(zoneDraft.start, zoneDraft.end).map(([x, y]) => [Math.round(x), Math.round(y)] as Pt);
      if ((q[1][0] - q[0][0]) / u > 8 && (q[2][1] - q[1][1]) / u > 8) oncreatezone?.(q);
      zoneDraft = null;
    }
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
    {#if oncamera}
      <button class="x cam" class:set={cameraSet} data-testid="camera-open" data-status={cameraSet ? 'set' : 'none'} title={cameraSet ? '이 사진의 원근이 맞춰져 있습니다. 눌러서 고치기' : '이 사진에서 치수를 재고 실사를 합성하려면 벽의 직선과 실측 길이로 원근을 맞추세요'} onpointerdown={(e) => e.stopPropagation()} onclick={oncamera}>{cameraSet ? '📐 원근 맞춤 ✓' : '📐 원근 맞추기'}</button>
    {/if}
    {#if onrender}<button class="x" class:set={threeD === 'ok'} data-testid="render-open" data-status={threeD} title={threeD === 'ok' ? '3D 뷰 (사진 속 벽면·사인물 합성)' : '이 사진은 아직 3D 가 안 됩니다 — 원근 맞추기 또는 치수 입력'} onpointerdown={(e) => e.stopPropagation()} onclick={onrender}>{threeD === 'ok' ? '🧊 3D ✓' : '🧊 3D'}</button>{/if}
    {#if editable}<button class="x" title="사진 삭제" onpointerdown={(e) => e.stopPropagation()} onclick={ondelete}>✕</button>{/if}
  </div>
  {#if url}
    <img src={url} alt={photo.name} data-testid="photo-img" draggable="false" />
    <!-- 입힌 디자인: 사진 px 좌표계에서 잘라낸 영역을 원근 사각형으로 변형 -->
    <div class="designs" style:width="{photo.w}px" style:height="{photo.h}px" style:transform="scale({scale})">
      {#each objects.filter((o) => o.design) as o (o.id)}
        {@const q = quadOf(o)}
        {@const c = o.design!.crop}
        <div class="design" style:clip-path={o.shape === 'rect' && !o.corner ? 'none' : `polygon(${outlinePts(o.shape, q, o.polygon, o.corner).map((p) => `${p[0]}px ${p[1]}px`).join(',')})`}>
          <div class="warp" style:transform={(() => { try { return cssMatrix3d(rectToQuad(c.w, c.h, q)); } catch { return 'none'; } })()}>
            <DesignFace design={o.design!} w={c.w} h={c.h} />
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="loading">불러오는 중…</div>
  {/if}
  <svg
    viewBox="0 0 {photo.w} {photo.h}"
    class:drawing={tool !== 'select'}
    class:pinning={tool === 'pin'}
    class:magicking={tool === 'magic'}
    class:zoning={tool === 'zone'}
    data-bg={tool === 'select' ? '' : undefined}
    role="presentation"
    onpointerdown={bgDown}
    onpointermove={(e) => { move(e); magicMove(e); }}
    onpointerup={up}
    onpointerenter={() => { if (tool === 'magic') onmagicenter?.(); }}
    onpointerleave={() => { if (tool === 'magic') onmagicleave?.(); }}
  >
    {#if zones.length}
      <path class="zone-dim" d={dimPath} fill-rule="evenodd" />
      {#each zones as zone, zi (zi)}
        {@const selected = zoneSel?.zone === zi}
        <polygon class="zone" class:sel={selected} data-testid="zone-shape" points={zone.map((p) => p.join(',')).join(' ')}
          stroke-width={2 * u} stroke-dasharray="{8 * u} {5 * u}" role="button" tabindex="-1"
          pointer-events={tool === 'magic' || tool === 'rect' || tool === 'ellipse' || tool === 'pin' ? 'none' : 'auto'} onpointerdown={(e) => zoneDown(e, zi)} onpointermove={move} onpointerup={up} />
        <text class="zone-label" x={zone[0][0]} y={zone[0][1] - 8 * u} font-size={12 * u} stroke-width={3 * u}>작업 존{zones.length > 1 ? ` ${zi + 1}` : ''}</text>
        {#if selected && editable}
          {#each midpoints(zone) as m, i (i)}
            <rect data-testid="zone-mid" class="zone-mid" x={m[0] - 4 * u} y={m[1] - 4 * u} width={8 * u} height={8 * u} stroke-width={1.5 * u} role="button" tabindex="-1" onpointerdown={(e) => zoneMidDown(e, zi, i, m)} />
          {/each}
          {#each zone as v, i (i)}
            <circle data-testid="zone-vertex" class="zone-vertex" class:sel={zoneSel?.vertex === i} cx={v[0]} cy={v[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
              onpointerdown={(e) => zoneVertexDown(e, zi, i)} onpointermove={zoneVertexMove} onpointerup={zoneVertexUp} />
          {/each}
        {/if}
      {/each}
    {/if}
    {#if zoneDraft}
      <polygon class="zone draft" points={quadFromDrag(zoneDraft.start, zoneDraft.end).map((p) => p.join(',')).join(' ')} stroke-width={2 * u} stroke-dasharray="{8 * u} {5 * u}" />
    {/if}
    {#if photo.camera}
      {@const refL = refLineOf(photo.camera, false, solveCamera(photo.camera, photo.w, photo.h) ?? undefined)}
      {@const pw = pairAxes(photo.camera)}
      <!-- 원근 설정(축 선·원점·기준 길이)을 옅게 보여 준다: 이 사진에 설정이 있다는 표시 -->
      <g class="camera" data-testid="camera-overlay" pointer-events="none">
        {#each photo.camera.x as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[0]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#each photo.camera.y as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[1]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#each photo.camera.z ?? [] as l, i (i)}<line class="cl" style:stroke={AXIS_COLOR[pw[2]]} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={1.5 * u} />{/each}
        {#if refL}<line class="cr" style:stroke={REF_COLOR} x1={refL.a[0]} y1={refL.a[1]} x2={refL.b[0]} y2={refL.b[1]} stroke-width={2 * u} />{/if}
        <circle class="co" cx={photo.camera.origin[0]} cy={photo.camera.origin[1]} r={5 * u} stroke-width={1.5 * u} />
      </g>
    {/if}
    {#each objects as o (o.id)}
      {@const q = quadOf(o)}
      {@const m = measures.get(o.id)}
      {@const sel = o.id === selectedId}
      {@const same = !sel && sameIds.includes(o.id)}
      {@const warn = (m?.warnings.length ?? 0) > 0}
      <g class="sign" class:sel class:same class:warn>
        <polygon
          data-testid="sign-shape"
          data-shape={o.shape}
          data-selected={sel || undefined}
          data-same={same || undefined}
          points={outline(o.shape, q, o.polygon, o.corner)}
          data-corner={o.shape === 'rect' ? (o.corner ?? 0) : undefined}
          stroke-width={2 * u}
          role="button"
          tabindex="-1"
          pointer-events={tool === 'magic' ? 'none' : 'auto'}
          onpointerdown={(e) => shapeDown(e, o, 'move')}
        />
        <text x={q[0][0]} y={q[0][1] - 6 * u} font-size={12 * u} stroke-width={3 * u}>
          {#if warn}<tspan data-testid="sign-warning-icon" class="w">⚠ </tspan>{/if}{#if unread[o.sameAs ?? o.id]}<tspan data-testid="sign-unread" class="u">💬 {unread[o.sameAs ?? o.id]} </tspan>{/if}{#if o.sameAs}<tspan data-testid="sign-linked" class="l">⇄ </tspan>{/if}{o.name}{#if o.widthMm && o.heightMm} · {fmt(o.widthMm)}×{fmt(o.heightMm)}{:else if m?.estimate} · ≈{fmt(m.estimate.widthMm)}×{fmt(m.estimate.heightMm)}{/if}
        </text>
        {#if sel && editable && tool === 'select'}
          {#each q as p, i (i)}
            <circle class="handle" data-testid="sign-handle" cx={p[0]} cy={p[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
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
      <polygon class="draft" points={outline('rect', quadFromDrag(draft.start, draft.end), undefined, drawShape === 'ellipse' ? 0.5 : 0)} stroke-width={2 * u} stroke-dasharray="{6 * u} {4 * u}" />
    {/if}
  </svg>
</div>

<style>
  .zone { position: absolute; box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35); background: #222; }
  img, .loading { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .loading { display: grid; place-items: center; color: #999; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .designs { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
  .design { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
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
  .header .x ~ .x { margin-left: 6px; }
  .sign polygon { fill: rgba(47, 139, 255, 0.12); stroke: var(--blue); cursor: pointer; }
  .sign.warn polygon { stroke: var(--warn); fill: rgba(255, 170, 0, 0.12); }
  .sign.sel polygon { fill: rgba(255, 204, 0, 0.16); stroke: var(--accent); }
  .sign.same polygon { fill: rgba(255, 204, 0, 0.1); stroke: var(--accent); stroke-dasharray: 6 4; }
  .sign text { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  .sign text .w { fill: var(--warn); }
  .sign text .u { fill: var(--accent); }
  .sign text .l { fill: var(--blue); }
  .camera { opacity: 0.55; }
  .camera .cl { stroke-dasharray: 6 4; }
  .camera .co { fill: none; stroke: #fff; }
  .header .cam.set, .header .x.set { color: var(--ok); }
  .handle { fill: #fff; stroke: var(--accent); cursor: grab; }
  .draft { fill: rgba(255, 204, 0, 0.12); stroke: var(--accent); pointer-events: none; }
  .magic { fill: rgba(47, 139, 255, 0.28); stroke: #7fd3ff; pointer-events: none; }
  svg.zoning { cursor: crosshair; }
  .zone-dim { fill: rgba(0, 0, 0, 0.28); pointer-events: none; }
  .zone { fill: transparent; stroke: #7ef0a0; cursor: pointer; }
  .zone.sel { stroke: var(--accent); }
  .zone.draft { stroke: var(--accent); pointer-events: none; }
  .zone-label { fill: #7ef0a0; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; font-weight: 600; pointer-events: none; }
  .zone-vertex { fill: #fff; stroke: #7ef0a0; cursor: grab; }
  .zone-vertex.sel { fill: var(--accent); stroke: #fff; }
  .zone-mid { fill: #7ef0a0; stroke: #fff; cursor: copy; }
  .status { fill: #fff; stroke: rgba(0, 0, 0, 0.75); paint-order: stroke; pointer-events: none; font-weight: 600; }
  svg.magicking { cursor: cell; }
</style>
