<!-- 사진 보드: 사진(구역)들이 놓인 무한 캔버스 -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import PhotoZone from './PhotoZone.svelte';
  import { app } from '../state.svelte';
  import { assetUrl, imageSize, putAsset } from '../assets';
  import { fitRect, type Viewport } from '../core/viewport';
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
    const t = e.target as HTMLElement;
    // 입력칸에서 Esc → 입력 종료 후 단축키 사용 가능
    if (e.key === 'Escape' && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { t.blur(); return; }
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'v' || k === 'escape') app.tool = 'select';
    else if (k === 'r') app.tool = 'rect';
    else if (k === 'o') app.tool = 'ellipse';
    else if ((k === 'delete' || k === 'backspace') && app.selectedId) {
      app.project.removeObject(app.selectedId);
      app.selectedId = null;
    }
  }

  let dropping = $state(false);
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
>
  <InfiniteCanvas
    bind:this={canvas}
    bind:viewport
    testid="board-canvas"
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
    {#snippet overlay()}
      {#if app.ready && !app.photos.length}
        <div class="empty">
          <p>건물 사진을 올려 시작하세요</p>
          <label class="btn primary">사진 추가<input type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
          <small>또는 사진을 여기로 끌어다 놓으세요</small>
        </div>
      {/if}
      <div class="tools" role="toolbar">
        <button class:on={app.tool === 'select'} title="선택 (V)" onclick={() => (app.tool = 'select')}>↖ 선택</button>
        <button class:on={app.tool === 'rect'} title="사각 영역 (R)" onclick={() => (app.tool = 'rect')}>▭ 사각</button>
        <button class:on={app.tool === 'ellipse'} title="원형 영역 (O)" onclick={() => (app.tool = 'ellipse')}>◯ 원형</button>
        <span class="sep"></span>
        <label class="file" title="사진 추가">＋ 사진<input data-testid="photo-input" type="file" accept="image/*" multiple hidden onchange={(e) => addPhotos(e.currentTarget.files!)} /></label>
        <button title="전체 보기" onclick={fitAll}>⤢</button>
        <span class="zoom">{Math.round(viewport.zoom * 100)}%</span>
      </div>
    {/snippet}
  </InfiniteCanvas>
</div>

<style>
  .board { position: absolute; inset: 0; }
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
