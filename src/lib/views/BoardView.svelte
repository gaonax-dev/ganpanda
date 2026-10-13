<!-- 사진 보드: 사진(구역)들이 놓인 무한 캔버스 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import PhotoZone from './PhotoZone.svelte';
  import { app } from '../state.svelte';
  import { assetUrl, imageSize, putAsset } from '../assets';
  import { fitRect, toScreen, type Viewport } from '../core/viewport';
  import { formatCombo, matchAction, type Action } from '../core/keymap';
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
      assetUrl(p.assetId).then((u) => { if (u) urls[p.assetId] = u; });
    }
  });

  // 처음 열 때 사진 전체가 보이도록
  $effect(() => {
    if (fitted || !app.ready || !app.photos.length) return;
    fitted = true;
    fitAll();
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
      const assetId = await putAsset(f);
      const url = (await assetUrl(assetId))!;
      const { w, h } = await imageSize(url);
      const width = 1200;
      // 기존 사진 오른쪽에 이어 붙이기
      const right = app.photos.reduce((m, p) => Math.max(m, p.x + p.width + 120), 0);
      app.project.addPhoto({ name: f.name, assetId, w, h, x: right + i * 40, y: 0, width });
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
    const n = app.objects.length + 1;
    const id = app.project.addObject({ photoId, name: `사인물 ${n}`, shape, quad, sheetIds: [] });
    app.selectedId = id;
    app.tool = 'select';
  }

  function onkey(e: KeyboardEvent) {
    if (app.settingsOpen || app.view !== 'board') return;
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
    // Esc 는 고정: 입력 중이면 입력 종료, 아니면 선택 도구
    if (e.key === 'Escape') { if (typing) t.blur(); else app.tool = 'select'; return; }
    if (typing) return;
    const action = matchAction(app.keymap, e, app.isMac);
    if (action === 'toolSelect') app.tool = 'select';
    else if (action === 'toolRect') app.tool = 'rect';
    else if (action === 'toolEllipse') app.tool = 'ellipse';
    else if (action === 'deleteSelection' && app.selectedId) {
      e.preventDefault();
      app.project.removeObject(app.selectedId);
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
  ondrop={(e) => { e.preventDefault(); dropping = false; if (e.dataTransfer?.files) addPhotos(e.dataTransfer.files); }}
  onpointermove={sendCursor}
  onpointerleave={() => app.setCursor(null)}
>
  <InfiniteCanvas
    bind:this={canvas}
    bind:viewport
    testid="board-canvas"
    onfit={fitAll}
    {zoomAnchor}
    onbackgrounddown={() => { app.selectedId = null; }}
  >
    {#each app.photos as p (p.id)}
      <PhotoZone
        photo={p}
        url={urls[p.assetId]}
        zoom={viewport.zoom}
        objects={app.objects.filter((o) => o.photoId === p.id)}
        measures={app.measures}
        selectedId={app.selectedId}
        tool={app.tool}
        toPhoto={toPhotoFor(p.id)}
        oncreate={(shape, quad) => create(p.id, shape, quad)}
        onselect={(id) => (app.selectedId = id)}
        onquad={(id, quad) => app.project.updateObject(id, { quad })}
        onmove={(dx, dy) => app.project.updatePhoto(p.id, { x: p.x + dx, y: p.y + dy })}
        ondelete={() => { if (confirm(`"${p.name}" 사진과 사인물을 삭제할까요?`)) app.project.removePhoto(p.id); }}
      />
    {/each}
    {#each app.peers as p (p.name)}
      {#each p.cursors as c, i (i)}
        <div class="cursor" data-testid="peer-cursor" style:left="{c.x}px" style:top="{c.y}px" style:transform="scale({1 / viewport.zoom})" style:--c={p.color}>
          <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l14 6-6 2-3 8z" fill="var(--c)" stroke="#fff" stroke-width="1.2"/></svg>
          <span>{p.name}</span>
        </div>
      {/each}
    {/each}
    {#snippet overlay()}
      {#if app.ready && !app.photos.length}
        <div class="empty">
          <p>건물 사진을 올려 시작하세요</p>
          <label class="btn primary">사진 추가<input type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
          <small>또는 사진을 여기로 끌어다 놓으세요</small>
        </div>
      {/if}
      <div class="tools" role="toolbar">
        <button class:on={app.tool === 'select'} title="선택 ({hint('toolSelect')})" onclick={() => (app.tool = 'select')}>↖ 선택</button>
        <button class:on={app.tool === 'rect'} title="사각 영역 ({hint('toolRect')})" onclick={() => (app.tool = 'rect')}>▭ 사각</button>
        <button class:on={app.tool === 'ellipse'} title="원형 영역 ({hint('toolEllipse')})" onclick={() => (app.tool = 'ellipse')}>◯ 원형</button>
        <span class="sep"></span>
        <label class="file" title="사진 추가">＋ 사진<input data-testid="photo-input" type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
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
  .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .zoom { color: var(--muted); font-size: 12px; min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
</style>
