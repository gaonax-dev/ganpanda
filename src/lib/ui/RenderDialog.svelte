<!-- 실사 보기 (5차): 사진 속 벽면에 사인물을 3D 로 합성 — 복원 카메라, 주간 그림자, 야간 발광, PNG 저장 -->
<script lang="ts">
  import type { Font } from 'opentype.js';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { Photo, SignObject } from '../core/model';
  import { renderSpecOf } from '../core/render';
  import { loadFont } from '../core/textShapes';
  import { placeOnWall, poseOfPlane, wallPlaneOf } from '../core/wallPlane';
  import { Viewer } from '../sim/viewer';
  import { buildChannel, buildLightbox, type BuiltSign, type FaceImage } from '../sim/signs';

  let { photo }: { photo: Photo } = $props();
  let host: HTMLDivElement;
  let viewer: Viewer | null = null;
  let font: Font | null = null;
  let ready = $state(false);
  let night = $state(false);
  let grid = $state(false);
  let status = $state('사진 불러오는 중…');
  let count = $state(0);
  let built: BuiltSign[] = [];
  let token = 0;

  const objects = $derived(app.objects.filter((o) => o.photoId === photo.id));
  const plane = $derived(wallPlaneOf(objects, app.calibrations.get(photo.id)));
  const close = () => (app.renderPhotoId = null);

  const loadImage = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  $effect(() => {
    const v = new Viewer(host);
    viewer = v;
    v.renderer.domElement.dataset.testid = 'render-canvas';
    v.showGrid(false);
    const fit = () => {
      // 사진 비율을 지키며 창에 맞춘다
      const W = host.clientWidth, H = host.clientHeight;
      if (!W || !H) return;
      const k = Math.min(W / photo.w, H / photo.h);
      v.resize(Math.floor(photo.w * k), Math.floor(photo.h * k));
    };
    const ro = new ResizeObserver(fit); ro.observe(host); fit();
    (async () => {
      try {
        const url = await assetUrl(photo.assetId);
        if (!url) throw new Error('no photo');
        v.setPhoto(await loadImage(url));
        font = await loadFont(fontUrl);
        ready = true;
      } catch { status = '사진이나 폰트를 불러오지 못했습니다.'; }
    })();
    return () => { ro.disconnect(); clear(); v.renderer.dispose(); host.innerHTML = ''; viewer = null; };
  });

  // 사인물·벽면·소스가 바뀌면 다시 합성
  $effect(() => { const p = plane, os = objects; app.sources; if (ready) void rebuild(p, os); });
  $effect(() => { viewer?.setNight(night); for (const b of built) b.setNight(night); });
  $effect(() => { viewer?.showGrid(grid); });

  function clear() {
    for (const b of built) { b.group.removeFromParent(); b.dispose(); }
    built = [];
  }

  async function faceOf(o: SignObject): Promise<FaceImage | undefined> {
    const d = o.design;
    const page = d && app.sources.find((s) => s.id === d.sourceId)?.pages[d.page];
    if (!d || !page) return undefined;
    const url = await assetUrl(page.assetId);
    if (!url) return undefined;
    const image = await loadImage(url);
    const kx = image.width / page.w, ky = image.height / page.h;
    return { image, sx: d.crop.x * kx, sy: d.crop.y * ky, sw: d.crop.w * kx, sh: d.crop.h * ky };
  }

  async function rebuild(p: typeof plane, os: SignObject[]) {
    const my = ++token;
    const v = viewer;
    if (!v || !font) return;
    clear();
    if (!p) { status = '카메라 설정(또는 치수를 입력한 사인물)이 필요합니다.'; count = 0; v.invalidate(); return; }
    status = '합성 중…';
    const placed = os.map((o) => ({ o, at: placeOnWall(p, o) }));
    const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
    const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
    v.applyPose(poseOfPlane(p, photo.w, photo.h), maxX, maxY);
    const items = await Promise.all(placed.map(async ({ o, at }) => {
      const spec = renderSpecOf(o, at);
      if (!spec) return null;
      const face = spec.kind === 'lightbox' ? await faceOf(o) : undefined;
      return { spec, face };
    }));
    if (my !== token) return;
    for (const it of items) {
      if (!it) continue;
      const b = it.spec.kind === 'channel' ? buildChannel(it.spec, font) : buildLightbox(it.spec, 'Pretendard, sans-serif', it.face);
      b.group.position.set(it.spec.x, it.spec.y, 0);
      b.setNight(night);
      v.signsRoot.add(b.group);
      built.push(b);
    }
    count = built.length;
    status = count ? '' : '분류(간판·스카시·시트)를 정한 사인물이 없습니다.';
    v.invalidate();
  }

  function savePng() {
    if (!viewer) return;
    const url = viewer.exportPng(photo.w, photo.h);
    app.lastRender = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${photo.name.replace(/\.[^.]+$/, '')}_실사_${night ? '야간' : '주간'}.png`;
    a.click();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="실사 보기" data-testid="render-dialog">
    <header>
      <h2>실사 보기 · {photo.name}</h2>
      <span class="count" data-testid="render-count">사인물 {count}</span>
      <span class="seg"><button class:on={!night} onclick={() => (night = false)}>주간</button><button data-testid="render-night" class:on={night} onclick={() => (night = true)}>야간</button></span>
      <label class="check"><input type="checkbox" bind:checked={grid} /> 벽면 격자</label>
      <button class="btn small" data-testid="render-save" disabled={!ready} onclick={savePng}>PNG 저장</button>
      <button class="icon" data-testid="close-render" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="view" bind:this={host}>
      {#if status}<div class="status" data-testid="render-status">{status}</div>{/if}
    </div>
    <footer>
      {#if plane}
        <small>벽면 기준: {plane.source === 'calibration' ? '카메라 설정' : `치수를 입력한 첫 사인물 (카메라 설정 권장)`} · 입체 글자는 채널 제품 + 문구, 보드·시트는 면으로 표시됩니다.</small>
      {:else}
        <small>사인물 하나에 가로·세로 치수를 넣거나 기준선을 적용하면 사진 속 벽면에 합성합니다.</small>
      {/if}
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1200px, calc(100vw - 32px)); height: min(820px, calc(100vh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; flex: 1; }
  .count { color: var(--muted); font-size: 12px; }
  .check { font-size: 12px; display: flex; align-items: center; gap: 4px; }
  .view { flex: 1; min-height: 0; position: relative; display: grid; place-items: center; background: #0a0c10; }
  .view :global(canvas) { display: block; }
  .status { position: absolute; inset: 0; display: grid; place-items: center; color: #eee; pointer-events: none; text-shadow: 0 1px 3px #000; }
  footer { padding: 8px 14px; border-top: 1px solid var(--line); color: var(--muted); }
</style>
