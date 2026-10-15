<!-- 사진 보드: 사진(구역)들이 놓인 무한 캔버스 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import PhotoZone from './PhotoZone.svelte';
  import BoardCard from './BoardCard.svelte';
  import { BOARD_PX_PER_MM, boardToList, flatOrigin, listToBoard, mmFromBoardRect } from '../core/boardCards';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { wallPlaneOf } from '../core/wallPlane';
  import type { Font } from 'opentype.js';
  import type { StageRenderer } from '../render/scene';
  import { app } from '../state.svelte';
  import { assetUrl, imageSize, putAsset, StorageLimitError } from '../assets';
  import { displayUrl } from '../photoDisplay';
  import { formatBytes } from '../core/format';
  import { fitRect, toScreen, type Viewport } from '../core/viewport';
  import { formatCombo, matchAction, type Action } from '../core/keymap';
  import { SERVER_URL } from '../sync';
  import type { Pt } from '../core/homography';
  import type { ShapeKind } from '../core/model';

  let viewport: Viewport = $state({ x: 80, y: 80, zoom: 0.5 });
  let canvas: InfiniteCanvas;
  let urls: Record<string, string> = $state({});
  let fitted = false;

  // 사진 에셋 URL 지연 로딩
  $effect(() => {
    for (const p of app.photos) {
      if (urls[p.assetId]) continue;
      displayUrl(p.assetId).then((u) => { if (u) urls[p.assetId] = u; }); // 줄인 사진 (휴대폰 메모리)
    }
  });

  // 처음 열 때 사진 전체가 보이도록
  $effect(() => {
    if (fitted || !app.ready || !app.photos.length) return;
    fitted = true;
    fitAll();
  });

  // 리스트에서 사진에 올린 뒤: 그 사진을 화면에 맞춘다
  $effect(() => {
    const r = app.reveal;
    if (!r) return;
    const p = app.photos.find((x) => x.id === r.photoId);
    if (!p || !canvas) return;
    const { w, h } = canvas.size();
    viewport = fitRect({ x: p.x, y: p.y - 40, w: p.width, h: p.width * (p.h / p.w) + 40 }, w, h, 40);
  });

  function fitAll() {
    if (!app.photos.length) return;
    const xs = app.photos.flatMap((p) => [p.x, p.x + p.width]);
    const ys = app.photos.flatMap((p) => [p.y, p.y + p.width * (p.h / p.w)]);
    const { w, h } = canvas.size();
    const x = Math.min(...xs), y = Math.min(...ys) - 60;
    viewport = fitRect({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, w, h, 60);
  }

  export async function addPhotos(files: FileList | File[]) {
    let i = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      let assetId: string;
      try {
        assetId = await putAsset(f);
      } catch (e) {
        if (e instanceof StorageLimitError) {
          app.notice = `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 "${f.name}"(${formatBytes(e.sizeBytes)})을 올릴 수 없습니다. 사용 중 ${formatBytes(e.usedBytes)}. 더 많은 용량이 필요하면 요금제를 올려 주세요.`;
          continue;
        }
        throw e;
      }
      const url = (await assetUrl(assetId))!;
      const { w, h } = await imageSize(url);
      const width = 1200;
      // 기존 사진 오른쪽에 이어 붙이기
      const right = app.photos.reduce((m, p) => Math.max(m, p.x + p.width + 120), 0);
      app.editBoundary();
      app.project.addPhoto({ name: f.name, assetId, w, h, x: right + i * 40, y: 0, width });
      app.editBoundary();
      i++;
    }
    fitted = false;
    queueMicrotask(fitAll);
  }

  function toPhotoFor(photoId: string) {
    return (cx: number, cy: number): Pt => {
      const p = app.project.photo(photoId)!;
      const w = canvas.clientToWorld(cx, cy);
      const s = p.w / p.width;
      return [(w.x - p.x) * s, (w.y - p.y) * s];
    };
  }

  function create(photoId: string, shape: ShapeKind, quad: Pt[]) {
    const n = app.signs.length + 1;
    app.editBoundary();
    // 원형 도구 = 모서리 50% 둥근 사각형 (이미지 맵핑이 되도록 사각형 기반, 사용자 결정 2026-10-14)
    const id = app.project.addObject({ photoId, name: `사인물 ${n}`, shape: shape === 'ellipse' ? 'rect' : shape, quad, sheetIds: [], ...(shape === 'ellipse' ? { corner: 0.5 } : {}) });
    app.editBoundary();
    app.selectedId = id;
    app.tool = 'select';
  }

  function onkey(e: KeyboardEvent) {
    if (app.settingsOpen || app.renderPhotoId || app.objectSettingsOpen || app.cameraPhotoId || app.view !== 'board') return;
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    // Esc 는 고정: 입력 중이면 입력 종료, 아니면 선택 도구
    if (e.key === 'Escape') { if (typing) t.blur(); else app.tool = 'select'; return; }
    if (typing) return;
    const action = matchAction(app.keymap, e, app.isMac);
    if (action === 'toolPin') { app.tool = 'pin'; return; } // viewer 도 핀은 꽂을 수 있다
    if (!app.canEdit) return;
    if (action === 'undo') { e.preventDefault(); app.undo(); return; }
    if (action === 'redo') { e.preventDefault(); app.redo(); return; }
    // 복사·붙여넣기·복제 (2026-10-15 사용자: "카피 페이스트 복제등이 필요하다")
    if (action === 'copy') { if (app.copySelected()) e.preventDefault(); return; }
    if (action === 'paste') { if (app.clipboard) { e.preventDefault(); app.pasteClipboard(); } return; }
    if (action === 'duplicate') { e.preventDefault(); app.duplicateSelected(); return; }
    if (action === 'toolMagic') { app.tool = 'magic'; return; }
    if (action === 'toolZone') { app.tool = 'zone'; return; }
    if (action === 'deleteSelection' && app.zoneSel) { e.preventDefault(); app.deleteZoneSelection(); return; }
    if (action === 'gizmoMove' || action === 'gizmoRotate' || action === 'gizmoScale') { app.tool = 'select'; app.gizmoMode = action === 'gizmoMove' ? 'move' : action === 'gizmoRotate' ? 'rotate' : 'scale'; return; }
    if (action === 'toolSelect') app.tool = 'select';
    else if (action === 'toolRect') app.tool = 'rect';
    else if (action === 'toolEllipse') app.tool = 'ellipse';
    else if (action === 'deleteSelection' && app.selectedId) {
      e.preventDefault();
      app.editBoundary();
      app.project.removeObject(app.selectedId);
      app.editBoundary();
      app.selectedId = null;
    }
  }

  /** 키보드 확대 기준: 선택한 사인물의 화면상 중심 */
  function zoomAnchor() {
    const o = app.selected;
    const p = o && app.photos.find((x) => x.id === o.photoId);
    if (!o || !p) return null;
    const s = p.width / p.w;
    const cx = o.quad.reduce((a, q) => a + q[0], 0) / 4, cy = o.quad.reduce((a, q) => a + q[1], 0) / 4;
    return toScreen(viewport, { x: p.x + cx * s, y: p.y + cy * s });
  }

  let dropping = $state(false);

  // ---------- 3D 단계: 사진마다 합성 결과(PNG)를 겹친다. 내용 키가 바뀐 사진만, 차례로 하나씩 (뷰어 하나 재사용) ----------
  let stageRenderer: StageRenderer | null = null;
  let stageFont: Font | null = null;
  let stagePumping = false;
  const stageQueue: string[] = [];
  async function pumpStage() {
    if (stagePumping) return;
    stagePumping = true;
    try {
      // three.js·폰트는 3D 단계를 처음 켤 때 내려받는다
      const [{ loadFont }, { StageRenderer }] = await Promise.all([import('../core/textShapes'), import('../render/scene')]);
      stageFont ??= await loadFont(fontUrl);
      while (stageQueue.length && app.stage === '3d') {
        const id = stageQueue.shift()!;
        const p = app.photos.find((x) => x.id === id);
        if (!p) continue;
        const key = app.stageKey(id);
        if (app.stageRenders[id]?.key === key) continue;
        const objs = app.objects.filter((o) => o.photoId === id);
        const plane = wallPlaneOf(objs, app.calibrations.get(id));
        if (!plane) { app.stageRenders[id] = { key, url: '' }; continue; } // 3D 벽면이 없는 사진은 원본 그대로
        stageRenderer ??= new StageRenderer();
        app.stageBusy++;
        try { app.stageRenders[id] = { key, url: await stageRenderer.render(p, objs, plane, app.sources, stageFont) }; }
        catch (e) { console.warn('3D 단계 합성 실패', e); app.stageRenders[id] = { key, url: '' }; }
        finally { app.stageBusy--; }
      }
    } finally { stagePumping = false; }
  }
  let stageTimer = 0;
  $effect(() => {
    if (app.stage !== '3d') { stageRenderer?.dispose(); stageRenderer = null; stageQueue.length = 0; return; }
    // 의존: 사진·사인물·카메라 (키 계산이 전부 읽는다)
    const stale = app.photos.filter((p) => app.stageRenders[p.id]?.key !== app.stageKey(p.id)).map((p) => p.id);
    if (!stale.length) return;
    clearTimeout(stageTimer);
    stageTimer = window.setTimeout(() => { for (const id of stale) if (!stageQueue.includes(id)) stageQueue.push(id); pumpStage(); }, 300);
  });
  // 3D 단계에서는 편집 도구를 쓰지 않는다
  $effect(() => { if (app.stage === '3d' && app.tool !== 'select' && app.tool !== 'pin') app.tool = 'select'; });

  // ---------- 평면 구역: 모든 사진 아래, 리스트 뷰와 같은 목록·배치(listX/listY mm × 0.1px/mm). 사인물(원본)마다 카드 하나 — 사진마다 중복되지 않는다 ----------
  const origin = $derived(flatOrigin(app.photos));

  // ---------- 보드 빈 곳에 사인물 만들기 (사각 도구로 끌기) ----------
  let draft: { x0: number; y0: number; x1: number; y1: number } | null = $state(null);
  function backgroundDown(_e: PointerEvent, world: { x: number; y: number }) {
    app.selectObject(null); app.selectPin(null); app.selectZone(null);
    if (!app.canEdit || (app.tool !== 'rect' && app.tool !== 'ellipse')) return false;
    draft = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
    const move = (ev: PointerEvent) => { const w = canvas.clientToWorld(ev.clientX, ev.clientY); draft = { ...draft!, x1: w.x, y1: w.y }; };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const d = draft!; draft = null;
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (w < 8 || h < 8) return;
      const at = boardToList(origin, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      app.createStandalone(at.x, at.y, mmFromBoardRect(w, h));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return true;
  }
  // 평면도 카드 끌어 배치 → listX/listY (리스트 뷰에도 그대로)
  let cardDrag: { id: string; dx: number; dy: number } | null = null;
  function cardDown(e: PointerEvent, o: typeof app.objects[number]) {
    if (e.button !== 0) return;
    e.stopPropagation();
    app.selectObject(o.id);
    if (!app.canEdit) return;
    const w = canvas.clientToWorld(e.clientX, e.clientY);
    const p = app.flatPlaced.get(o.id)!;
    const at = listToBoard(origin, p.x, p.y);
    cardDrag = { id: o.id, dx: w.x - at.x, dy: w.y - at.y };
    const move = (ev: PointerEvent) => { if (!cardDrag) return; const q = canvas.clientToWorld(ev.clientX, ev.clientY); const l = boardToList(origin, q.x - cardDrag.dx, q.y - cardDrag.dy); app.project.updateObject(cardDrag.id, { listX: l.x, listY: l.y }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); cardDrag = null; app.editBoundary(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // 자동 분리 도구를 고르면 모델·사진 분석을 미리 시작한다
  $effect(() => {
    if (app.tool === 'magic') for (const p of app.photos) app.prepareSegment(p.id);
    else app.clearHoverSegment();
  });

  // 내 커서를 다른 접속자에게 (world 좌표, 50ms 간격)
  let cursorTimer = 0;
  function sendCursor(e: PointerEvent) {
    if (cursorTimer) return;
    cursorTimer = window.setTimeout(() => {
      cursorTimer = 0;
      app.setCursor(canvas.clientToWorld(e.clientX, e.clientY));
    }, 50);
  }
  const hint = (a: Action) => app.keymap[a].map((c) => formatCombo(c, app.isMac)).join(', ') || '없음';
</script>

<svelte:window onkeydown={onkey} />

<div
  class="board"
  role="region"
  aria-label="사진 보드"
  class:dropping
  ondragover={(e) => { e.preventDefault(); dropping = true; }}
  ondragleave={() => (dropping = false)}
  ondrop={(e) => { e.preventDefault(); dropping = false; if (app.canEdit && e.dataTransfer?.files) addPhotos(e.dataTransfer.files); }}
  onpointermove={sendCursor}
  onpointerleave={() => app.setCursor(null)}
>
  <InfiniteCanvas
    bind:this={canvas}
    bind:viewport
    testid="board-canvas"
    onfit={fitAll}
    {zoomAnchor}
    onbackgrounddown={backgroundDown}
    cursor={app.canEdit && (app.tool === 'rect' || app.tool === 'ellipse') ? 'crosshair' : 'default'}
  >
    {#each app.photos as p (p.id)}
      <PhotoZone
        photo={p}
        url={urls[p.assetId]}
        zoom={viewport.zoom}
        objects={app.objects.filter((o) => o.photoId === p.id)}
        measures={app.measures}
        selectedId={app.selectedId}
        sameIds={app.sameAsSelected}
        tool={app.stage === '3d' ? (app.tool === 'pin' ? 'pin' : 'select') : app.canEdit || app.tool === 'pin' ? app.tool : 'select'}
        overlay={app.stage === '3d' ? app.stageRenders[p.id]?.url || undefined : undefined}
        calib={app.calibrations.get(p.id)}
        gizmoPx={app.gizmoSize}
        editable={app.canEdit}
        unread={app.unread}
        pins={app.pins.filter((x) => x.photoId === p.id)}
        selectedPinId={app.selectedPinId}
        oncreatepin={(x, y) => app.createPin(p.id, x, y)}
        onselectpin={(id) => app.selectPin(id)}
        onmovepin={(id, x, y) => app.project.updatePin(id, { x, y })}
        onpinmoveend={() => app.editBoundary()}
        segmentState={app.embeddedPhotos[p.id]}
        hoverPolygon={app.hoverSegment?.photoId === p.id ? app.hoverSegment.polygon : null}
        onmagicenter={() => app.prepareSegment(p.id)}
        onmagichover={(x, y) => app.segmentAt(p.id, x, y)}
        onmagicleave={() => app.clearHoverSegment()}
        onmagicclick={() => app.createFromSegment()}
        zoneSel={app.zoneSel?.photoId === p.id ? { zone: app.zoneSel.zone, vertex: app.zoneSel.vertex } : undefined}
        oncreatezone={(zone) => app.addZone(p.id, zone)}
        onselectzone={(zone, vertex) => (zone === null ? app.selectZone(null) : app.selectZone(p.id, zone, vertex))}
        onmovezonevertex={(zone, i, pt) => app.moveZoneVertex(p.id, zone, i, pt)}
        onzonemoveend={() => app.editBoundary()}
        onaddzonevertex={(zone, edge, pt) => app.addZoneVertex(p.id, zone, edge, pt)}
        toPhoto={toPhotoFor(p.id)}
        oncreate={(shape, quad) => create(p.id, shape, quad)}
        onselect={(id) => app.selectObject(id)}
        ontap={() => { if (app.compact) { const first = app.photoSigns(p.id)[0]; if (first) app.selectObject(first.id); } }}
        onbox={(id, patch) => { app.project.updateObject(id, patch); app.editBoundary(); }}
        onquad={(id, quad) => { app.project.updateObject(id, { quad }); app.editBoundary(); }}
        onmove={(dx, dy) => app.project.updatePhoto(p.id, { x: p.x + dx, y: p.y + dy })}
        onrender={() => (app.renderPhotoId = p.id)}
        oncamera={() => app.openCamera(p.id)}
        cameraSet={app.cameras.has(p.id)}
        threeD={app.threeDOk(p.id) ? 'ok' : 'none'}
        showWarnings={app.warnMeasure}
        ondelete={() => { if (confirm(`"${p.name}" 사진과 사인물을 삭제할까요?`)) { app.editBoundary(); app.project.removePhoto(p.id); app.editBoundary(); } }}
      />
    {/each}
    <!-- 평면 구역: 리스트 뷰와 같은 배치. 사인물(원본)마다 카드 하나, 끌어서 배치 (2026-10-15) -->
    {#if app.flatCards.length}
      <div class="flat-label" style:left="{origin.x}px" style:top="{origin.y - 22}px" style:transform="scale({1 / viewport.zoom})" style:transform-origin="0 100%">평면도 · 끌어서 배치 (리스트와 같은 배치)</div>
    {/if}
    {#each app.flatCards as { o, w, h } (o.id)}
      {@const p = app.flatPlaced.get(o.id)!}
      {@const at = listToBoard(origin, p.x, p.y)}
      {@const photo = app.photos.find((x) => x.id === o.photoId)}
      <BoardCard {o} x={at.x} y={at.y} w={w * BOARD_PX_PER_MM} h={h * BOARD_PX_PER_MM} {photo} zoom={viewport.zoom} selected={app.selectedId === o.id || app.sameAsSelected.includes(o.id)} standalone={!o.photoId} linked={app.objects.some((x) => x.sameAs === o.id)} onpointerdown={(e) => cardDown(e, o)} />
    {/each}
    {#if draft}
      <div class="draft" data-testid="board-draft" style:left="{Math.min(draft.x0, draft.x1)}px" style:top="{Math.min(draft.y0, draft.y1)}px" style:width="{Math.abs(draft.x1 - draft.x0)}px" style:height="{Math.abs(draft.y1 - draft.y0)}px"></div>
    {/if}
    {#each app.peers as p (p.name)}
      {#each p.cursors as c, i (i)}
        <div class="cursor" data-testid="peer-cursor" style:left="{c.x}px" style:top="{c.y}px" style:transform="scale({1 / viewport.zoom})" style:--c={p.color}>
          <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l14 6-6 2-3 8z" fill="var(--c)" stroke="#fff" stroke-width="1.2"/></svg>
          <span>{p.name}</span>
        </div>
      {/each}
    {/each}
    {#snippet overlay()}
      {#if app.stage === '3d' && app.stageBusy}
        <div class="ai-status" data-testid="stage-status">3D 합성 중… ({app.stageBusy})</div>
      {/if}
      {#if app.tool === 'magic' && app.segmentStatus !== 'ready'}
        <div class="ai-status" data-testid="ai-status" data-status={app.segmentStatus}>
          {#if app.segmentStatus === 'error'}AI 모델을 불러오지 못했습니다. {app.segmentError}
          {:else}AI 모델 불러오는 중… (처음 한 번, 약 14MB){/if}
        </div>
      {/if}
      {#if app.ready && !app.photos.length && app.canEdit}
        <div class="empty">
          <p>건물 사진을 올려 시작하세요</p>
          <label class="btn primary">사진 추가<input type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
          <small>또는 사진을 여기로 끌어다 놓으세요</small>
        </div>
      {/if}
      <div class="tools" role="toolbar">
        {#if app.canEdit}
          <button data-testid="tool-select" class:on={app.tool === 'select'} title="선택 ({hint('toolSelect')})" onclick={() => (app.tool = 'select')}>↖<span class="lbl"> 선택</span></button>
          <button data-testid="tool-rect" class:on={app.tool === 'rect'} title="사각 영역 ({hint('toolRect')})" onclick={() => (app.tool = 'rect')}>▭<span class="lbl"> 사각</span></button>
          <button data-testid="tool-ellipse" class:on={app.tool === 'ellipse'} title="원형 영역 ({hint('toolEllipse')})" onclick={() => (app.tool = 'ellipse')}>◯<span class="lbl"> 원형</span></button>
          <button data-testid="tool-pin" class:on={app.tool === 'pin'} title="핀 · 위치 코멘트 ({hint('toolPin')})" onclick={() => (app.tool = 'pin')}>📍<span class="lbl"> 핀</span></button>
          <button data-testid="tool-zone" class:on={app.tool === 'zone'} title="작업 존 ({hint('toolZone')})" onclick={() => (app.tool = 'zone')}>▱<span class="lbl"> 존</span></button>
          {#if SERVER_URL}
            <button data-testid="tool-magic" class:on={app.tool === 'magic'} title="자동 분리 · AI ({hint('toolMagic')})" onclick={() => (app.tool = 'magic')}>✨<span class="lbl"> 자동</span></button>
          {/if}
          <span class="sep"></span>
          <button data-testid="undo" title="실행 취소 ({hint('undo')})" disabled={!app.canUndo} onclick={() => app.undo()}>↶</button>
          <button data-testid="redo" title="다시 실행 ({hint('redo')})" disabled={!app.canRedo} onclick={() => app.redo()}>↷</button>
          <span class="sep"></span>
          <label class="file" title="사진 추가">＋<span class="lbl"> 사진</span><input data-testid="photo-input" type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
        {:else}
          <button data-testid="tool-pin" class:on={app.tool === 'pin'} title="핀 · 위치 코멘트 ({hint('toolPin')})" onclick={() => (app.tool = app.tool === 'pin' ? 'select' : 'pin')}>📍 핀</button>
          <span class="readonly">보기·대화만 가능</span>
        {/if}
        <button title="전체 보기 ({hint('zoomFit')})" onclick={fitAll}>⤢</button>
        <span class="zoom" data-testid="zoom-label">{Math.round(viewport.zoom * 100)}%</span>
      </div>
    {/snippet}
  </InfiniteCanvas>
</div>

<style>
  .board { position: absolute; inset: 0; }
  .cursor { position: absolute; transform-origin: 0 0; pointer-events: none; display: flex; align-items: flex-start; gap: 2px; z-index: 3; }
  .cursor span { background: var(--c); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 4px; white-space: nowrap; margin-top: 10px; }
  .board.dropping { outline: 3px dashed var(--accent); outline-offset: -6px; }
  .draft { position: absolute; border: 1px dashed var(--accent); background: rgba(255, 204, 0, 0.08); pointer-events: none; }
  .flat-label { position: absolute; color: var(--muted); font-size: 11px; white-space: nowrap; pointer-events: none; }
  .empty {
    position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px;
    color: var(--muted); pointer-events: none;
  }
  .empty > * { pointer-events: auto; }
  .empty p { font-size: 16px; color: var(--text); margin: 0; }
  .tools {
    position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%);
    display: flex; align-items: center; gap: 4px; padding: 5px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  .tools button, .tools .file {
    background: none; border: 0; color: var(--text); padding: 7px 11px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer;
  }
  .tools button:hover, .tools .file:hover { background: var(--hover); }
  .tools button.on { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .tools button:disabled { opacity: 0.35; cursor: default; }
  .ai-status { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; font-size: 13px; z-index: 4; }
  .ai-status[data-status='error'] { border-color: var(--danger); }
  .readonly { color: var(--muted); font-size: 12px; padding: 7px 11px; }
  .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .zoom { color: var(--muted); font-size: 12px; min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
  .tools button, .tools .file { white-space: nowrap; }
  /* 휴대폰 폭: 아이콘만, 화면 폭에 맞춰 가로 스크롤 */
  @media (max-width: 720px) {
    .tools { left: 8px; right: 8px; bottom: 8px; transform: none; overflow-x: auto; justify-content: flex-start; gap: 2px; scrollbar-width: none; }
    .tools .lbl, .tools .zoom { display: none; }
    .tools button, .tools .file { padding: 9px 10px; font-size: 15px; }
    .empty p { font-size: 15px; text-align: center; padding: 0 16px; }
  }
</style>
