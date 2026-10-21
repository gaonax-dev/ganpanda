<script lang="ts">
  // 이미지 조절 창 (2026-10-21 사용자: "이미지 조절(크롭(크게도 가능하게),밝기)"): 원본 위에 크롭 상자(원본 밖으로도 키운다 = 흰 여백) + 밝기.
  // [적용]이 새 그림을 구워 바꾸고 좌표를 옮긴다 (app.applyPhotoAdjust → core/photoEdit.ts). 원본은 Photo.source 로 남아 다시 조절해도 화질이 안 줄어든다
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import { displayUrl } from '../photoDisplay';
  import { BRIGHTNESS_RANGE, CROP_MIN, normalizeCrop, sourceOf, type Crop } from '../core/photoEdit';
  import type { Photo } from '../core/model';

  let { photo }: { photo: Photo } = $props();
  const src = sourceOf(photo);
  let crop = $state<Crop>({ ...src.crop });
  let brightness = $state(src.brightness);
  let url = $state<string | undefined>();
  let host = $state<HTMLDivElement | null>(null);
  let hostW = $state(800), hostH = $state(600);

  /** 원본 둘레 여백 (원본 긴 변의 절반) — 그 안에서 크롭을 원본 밖으로 늘릴 수 있다 */
  const PAD = Math.round(Math.max(src.w, src.h) * 0.5);
  const stageW = src.w + PAD * 2, stageH = src.h + PAD * 2;
  const scale = $derived(Math.min(hostW / stageW, hostH / stageH));
  const original = $derived(crop.x === 0 && crop.y === 0 && crop.w === src.w && crop.h === src.h && brightness === 1);
  const changed = $derived(crop.x !== src.crop.x || crop.y !== src.crop.y || crop.w !== src.crop.w || crop.h !== src.crop.h || brightness !== src.brightness);

  $effect(() => {
    // 표시용 줄인 원본 (휴대폰 메모리) — 없으면 원본
    displayUrl(src.assetId, { w: src.w, h: src.h }).then(async (u) => { url = u ?? (await assetUrl(src.assetId)); });
  });
  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver(() => { hostW = host!.clientWidth; hostH = host!.clientHeight; });
    ro.observe(host);
    hostW = host.clientWidth; hostH = host.clientHeight;
    return () => ro.disconnect();
  });

  const close = () => (app.adjustPhotoId = null);
  const reset = () => { crop = { x: 0, y: 0, w: src.w, h: src.h }; brightness = 1; };
  async function apply() {
    if (await app.applyPhotoAdjust(photo.id, normalizeCrop(crop), brightness)) close();
  }

  // ----- 크롭 상자 끌기: 모서리·변 핸들 = 크기, 안쪽 = 이동 (원본 px) -----
  type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';
  let drag: { h: Handle; sx: number; sy: number; c: Crop; id: number } | null = null;
  function down(e: PointerEvent, h: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag = { h, sx: e.clientX, sy: e.clientY, c: { ...crop }, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale;
    const c = { ...drag.c };
    const h = drag.h;
    if (h === 'move') { c.x += dx; c.y += dy; }
    else {
      if (h.includes('w')) { c.x += dx; c.w -= dx; }
      if (h.includes('e')) c.w += dx;
      if (h.includes('n')) { c.y += dy; c.h -= dy; }
      if (h.includes('s')) c.h += dy;
      if (c.w < CROP_MIN) { if (h.includes('w')) c.x = drag.c.x + drag.c.w - CROP_MIN; c.w = CROP_MIN; }
      if (c.h < CROP_MIN) { if (h.includes('n')) c.y = drag.c.y + drag.c.h - CROP_MIN; c.h = CROP_MIN; }
    }
    // 여백 안에 머문다
    c.x = Math.max(-PAD, Math.min(src.w + PAD - c.w, c.x));
    c.y = Math.max(-PAD, Math.min(src.h + PAD - c.h, c.y));
    crop = normalizeCrop(c);
  }
  function up(e: PointerEvent) { if (drag && e.pointerId === drag.id) drag = null; }
  const setNum = (k: keyof Crop, v: number) => { if (Number.isFinite(v)) crop = normalizeCrop({ ...crop, [k]: v }); };
  /** 원본 px → 무대(stage) px */
  const sx = (x: number) => (x + PAD) * scale;
  const sy = (y: number) => (y + PAD) * scale;
  const cursors: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', move: 'move' };
  const HS = 7; // 핸들 반지름 (화면 px)
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="이미지 조절" data-testid="photo-adjust-dialog">
    <header>
      <h2>이미지 조절 · {photo.name}</h2>
      <small>크롭 상자를 끌어 자르거나 <b>원본 밖으로 키워 여백</b>을 더합니다(흰색). 영역·존·원근·말풍선은 같은 자리에 남습니다. 원본은 보관되어 언제든 되돌립니다.</small>
      <button class="icon" data-testid="close-photo-adjust" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="body">
      <div class="view" bind:this={host}>
        <div class="stage" style:width="{stageW * scale}px" style:height="{stageH * scale}px">
          <div class="pad" style:left="{sx(crop.x)}px" style:top="{sy(crop.y)}px" style:width="{crop.w * scale}px" style:height="{crop.h * scale}px"></div>
          {#if url}<img src={url} alt={photo.name} draggable="false" style:left="{sx(0)}px" style:top="{sy(0)}px" style:width="{src.w * scale}px" style:height="{src.h * scale}px" style:filter="brightness({brightness})" />{/if}
          <!-- 크롭 밖은 어둡게 -->
          <svg class="ov" width={stageW * scale} height={stageH * scale} onpointermove={move} onpointerup={up} onpointercancel={up}>
            <defs><mask id="cropmask"><rect width="100%" height="100%" fill="#fff" /><rect x={sx(crop.x)} y={sy(crop.y)} width={crop.w * scale} height={crop.h * scale} fill="#000" /></mask></defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#cropmask)" />
            <rect class="box" data-testid="crop-box" x={sx(crop.x)} y={sy(crop.y)} width={crop.w * scale} height={crop.h * scale} style:cursor={cursors.move} onpointerdown={(e) => down(e, 'move')} />
            {#each [['nw', crop.x, crop.y], ['n', crop.x + crop.w / 2, crop.y], ['ne', crop.x + crop.w, crop.y], ['e', crop.x + crop.w, crop.y + crop.h / 2], ['se', crop.x + crop.w, crop.y + crop.h], ['s', crop.x + crop.w / 2, crop.y + crop.h], ['sw', crop.x, crop.y + crop.h], ['w', crop.x, crop.y + crop.h / 2]] as [h, x, y] (h)}
              <rect class="hd" data-testid="crop-handle-{h}" x={sx(x as number) - HS} y={sy(y as number) - HS} width={HS * 2} height={HS * 2} style:cursor={cursors[h as Handle]} onpointerdown={(e) => down(e, h as Handle)} />
            {/each}
          </svg>
        </div>
      </div>
      <aside>
        <section>
          <h3>크롭 <small>(원본 px · 음수 = 여백)</small></h3>
          <div class="grid">
            <label>X <input type="number" data-testid="crop-x" value={crop.x} onchange={(e) => setNum('x', e.currentTarget.valueAsNumber)} /></label>
            <label>Y <input type="number" data-testid="crop-y" value={crop.y} onchange={(e) => setNum('y', e.currentTarget.valueAsNumber)} /></label>
            <label>가로 <input type="number" data-testid="crop-w" min={CROP_MIN} value={crop.w} onchange={(e) => setNum('w', e.currentTarget.valueAsNumber)} /></label>
            <label>세로 <input type="number" data-testid="crop-h" min={CROP_MIN} value={crop.h} onchange={(e) => setNum('h', e.currentTarget.valueAsNumber)} /></label>
          </div>
          <p class="hint">원본 {src.w}×{src.h} → 결과 {crop.w}×{crop.h}</p>
        </section>
        <section>
          <h3>밝기 <small>{Math.round(brightness * 100)}%</small></h3>
          <input type="range" data-testid="brightness" min={BRIGHTNESS_RANGE.min} max={BRIGHTNESS_RANGE.max} step="0.05" bind:value={brightness} />
        </section>
        <div class="actions">
          <button class="btn small primary" data-testid="photo-adjust-apply" disabled={!changed || app.photoBusy} onclick={apply}>{app.photoBusy ? '굽는 중…' : '적용'}</button>
          <button class="btn small" onclick={close}>취소</button>
          <button class="btn small" data-testid="photo-adjust-reset" disabled={original} onclick={reset}>원본으로</button>
        </div>
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1100px, calc(100vw - 32px)); height: min(760px, calc(100dvh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; white-space: nowrap; }
  header small { flex: 1; color: var(--muted); font-size: 12px; }
  .icon { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; }
  .body { flex: 1; display: grid; grid-template-columns: 1fr 260px; min-height: 0; }
  .view { position: relative; display: grid; place-items: center; background: #0a0c10; overflow: hidden; }
  .stage { position: relative; }
  .stage img, .stage .pad { position: absolute; user-select: none; }
  .pad { background: #fff; }
  .ov { position: absolute; inset: 0; touch-action: none; }
  .box { fill: transparent; stroke: #fff; stroke-width: 1.5; }
  .hd { fill: #fff; stroke: #333; stroke-width: 1; }
  aside { border-left: 1px solid var(--line); padding: 12px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
  h3 { margin: 0 0 6px; font-size: 13px; }
  h3 small { color: var(--muted); font-weight: 400; font-size: 11px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .grid label { display: flex; flex-direction: column; font-size: 11px; color: var(--muted); gap: 2px; }
  .grid input { width: 100%; }
  input[type='range'] { width: 100%; }
  .hint { color: var(--muted); font-size: 11px; margin: 6px 0 0; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; }
  @media (max-width: 720px) {
    .backdrop { place-items: stretch; }
    .dialog { width: 100vw; height: 100%; border-radius: 0; border: 0; }
    .body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
    aside { border-left: 0; border-top: 1px solid var(--line); }
    header small { display: none; }
  }
</style>
