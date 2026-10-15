<!-- 3D 뷰 (사진마다): 사진 + 복원 카메라 + 벽면 격자·축. 사인물이 있으면 3D 로 합성 (주간 그림자·야간 발광), PNG 저장.
     카메라가 없으면(원근 맞추기 전·치수 없음) 왜 3D 가 안 되는지와 다음 할 일을 알려 준다 -->
<script lang="ts">
  import type { Font } from 'opentype.js';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { Photo, SignObject } from '../core/model';
  import { fitScale, renderSpecOf } from '../core/render';
  import { loadFont } from '../core/textShapes';
  import { placeOnWall, poseOfPlane, projectionFromPlane, quadOnWall, signPlaneOf, wallPlaneOf } from '../core/wallPlane';
  import { Viewer } from '../sim/viewer';
  import { buildLightbox, buildSign, warpToQuad, type BuiltSign, type FaceImage } from '../sim/signs';

  let { photo }: { photo: Photo } = $props();
  let host: HTMLDivElement;
  let viewer: Viewer | null = null;
  let font: Font | null = null;
  let ready = $state(false);
  let night = $state(false);
  let grid = $state(true);
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
    v.showGrid(true);
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
    viewer?.clearSignCameras();
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
    if (!p) { status = '이 사진은 아직 3D 를 만들 수 없습니다. 사인물 영역을 하나 그리거나 [원근 맞추기]를 하세요.'; count = 0; v.invalidate(); return; }
    status = '합성 중…';
    // 사인물마다 자기 영역을 벽면으로 (치수 있으면 그 mm, 없으면 비율만) — 사진의 카메라가 어떻든 그린 자리에 보인다
    const placed = os.map((o) => { const own = signPlaneOf(o, p) ?? p; /* 원근에 맞는 사인물은 원근 설정의 각도 우선 (2026-10-15) */ return { o, plane: own, at: placeOnWall(own, o), corners: quadOnWall(own, o) as [number, number][] }; });
    const maxX = Math.max(1000, ...placed.map((x) => x.at.cx + x.at.w / 2));
    const maxY = Math.max(1000, ...placed.map((x) => x.at.cy + x.at.h / 2));
    v.applyProjection(projectionFromPlane(p, photo.w, photo.h), poseOfPlane(p, photo.w, photo.h), maxX, maxY); // 그린 영역에 정확히 맞물림
    const items = await Promise.all(placed.map(async ({ o, plane: own, at, corners }) => {
      const spec = renderSpecOf(o, at);
      if (!spec) return null;
      const face = spec.kind === 'lightbox' ? await faceOf(o) : undefined;
      return { spec, face, corners, plane: own };
    }));
    if (my !== token) return;
    v.clearSignCameras();
    // 사인물 하나가 실패해도(폰트에 없는 글자, 찌그러진 영역 등) 나머지는 계속 그린다 (2026-10-14: 뒤에 만든 사인물이 안 보이던 원인)
    const notes: string[] = [];
    for (const it of items) {
      if (!it) continue;
      let b: BuiltSign;
      try {
        b = buildSign(it.spec, font, 'Pretendard, sans-serif', it.face);
      } catch (e) {
        try { b = buildLightbox({ ...it.spec, kind: 'lightbox', text: '' }, 'Pretendard, sans-serif'); notes.push(`"${os.find((o) => o.id === it.spec.id)?.name ?? it.spec.id}": 입체 글자를 만들 수 없어 상자로 표시 (${e instanceof Error ? e.message : e})`); }
        catch { notes.push(`"${os.find((o) => o.id === it.spec.id)?.name ?? it.spec.id}": 그릴 수 없음`); continue; }
      }
      // 그린 사각형에 정확히 맞춘다 (카메라가 벽과 어긋나도). 글자는 먼저 영역 폭에 맞춤
      warpToQuad(b.group, it.spec.widthMm, it.spec.heightMm, it.corners, it.spec.kind === 'channel' ? fitScale(b.measured.widthMm, it.spec.widthMm) : 1);
      b.setNight(night);
      v.signsRoot.add(b.group);
      v.addSignCamera(b.group, projectionFromPlane(it.plane, photo.w, photo.h), poseOfPlane(it.plane, photo.w, photo.h), it.corners);
      built.push(b);
    }
    count = built.length;
    const skipped = os.length - count;
    status = [skipped ? `사인물 ${os.length}개 중 ${count}개 표시 (${skipped}개는 영역이 찌그러져 그릴 수 없음)` : '', ...notes].filter(Boolean).join(' · ');
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
  <div class="dialog" role="dialog" aria-modal="true" aria-label="렌더링" data-testid="render-dialog">
    <header>
      <h2>렌더링 · {photo.name}</h2>
      <span class="count" data-testid="render-count">사인물 {count}</span>
      <span class="seg"><button class:on={!night} onclick={() => (night = false)}>주간</button><button data-testid="render-night" class:on={night} onclick={() => (night = true)}>야간</button></span>
      <label class="check"><input type="checkbox" bind:checked={grid} /> 벽면 격자</label>
      <button class="btn small" data-testid="render-save" disabled={!ready} onclick={savePng}>PNG 저장</button>
      <button class="icon" data-testid="close-render" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="view" bind:this={host}>
      {#if status}<div class="status" data-testid="render-status">{status}{#if !plane && app.canEdit}<button class="btn small primary" data-testid="render-open-camera" onclick={() => { close(); app.openCamera(photo.id); }}>원근 맞추기</button>{/if}</div>{/if}
    </div>
    <footer>
      {#if plane}
        <small>3D 기준: {plane.source === 'calibration' ? '카메라 설정 (원근 맞추기)' : plane.source === 'reference' ? '치수를 입력한 첫 사인물 — 원근 맞추기를 하면 더 정확합니다' : '그린 영역 (치수·원근 없음 — 자리와 비율만 맞춤, 원근 맞추기를 하면 정확해집니다)'} · 격자 1칸 = 1m, 축 가로 X 빨강 · 높이 Z 파랑 · 세로 Y 초록(앞쪽), 흰 상자 = 1m. {count ? '입체 글자는 채널 제품 + 문구, 보드·시트는 면으로 표시됩니다.' : '사인물이 없어도 3D 는 봅니다. 분류를 정한 사인물이 생기면 여기에 놓입니다.'}</small>
      {:else}
        <small>원근을 맞추거나 사인물 하나에 가로·세로 치수를 넣으면 이 사진에 3D 벽면이 생깁니다.</small>
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
  .status { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; color: #eee; text-shadow: 0 1px 3px #000; text-align: center; padding: 20px; }
  footer { padding: 8px 14px; border-top: 1px solid var(--line); color: var(--muted); }
  h2 { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media (max-width: 720px) {
    .backdrop { place-items: stretch; }
    .dialog { width: 100vw; height: 100%; border-radius: 0; border: 0; }
    header { flex-wrap: wrap; gap: 8px; padding: 8px 10px; }
    h2 { flex-basis: 100%; font-size: 14px; }
    .count { display: none; }
    footer { font-size: 11px; max-height: 64px; overflow-y: auto; }
  }
</style>
