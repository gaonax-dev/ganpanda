<!-- 기준선 직접 조정 창: AI 가 잡은(또는 그대로인) 영역 꼭짓점을 사진 위에서 끌어 고친다. 돋보기로 정밀 조정, 적용하면 영역에 저장 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { Pt } from '../core/homography';
  import type { Photo } from '../core/model';

  let { photo }: { photo: Photo } = $props();
  let url = $state<string | undefined>(undefined);
  let img: HTMLImageElement | undefined = $state(undefined);
  let svg: SVGSVGElement = $state()!;
  let host: HTMLDivElement;
  let scale = $state(1); // 화면 px / 사진 px
  let drag: { objectId: string; index: number; pointerId: number } | null = $state(null);
  let loupe: HTMLCanvasElement | undefined = $state(undefined);
  let loupeAt = $state<Pt | null>(null);
  const LOUPE = 3;

  const ev = $derived(app.calibEvals[photo.id]);
  const objects = $derived(app.objects.filter((o) => o.photoId === photo.id));
  const quadOf = (id: string, fallback: Pt[]) => ev?.snapped[id] ?? fallback;
  const LABEL = { top: '위 변', bottom: '아래 변', left: '왼쪽 변', right: '오른쪽 변' } as const;
  const nameOf = (id: string) => objects.find((o) => o.id === id)?.name ?? id;
  const refOf = (objectId: string, edge: 'top' | 'bottom' | 'left' | 'right') => ev?.refs.find((r) => r.objectId === objectId && r.edge === edge);
  const EDGES: { edge: 'top' | 'bottom' | 'left' | 'right'; i: [number, number] }[] = [{ edge: 'top', i: [0, 1] }, { edge: 'right', i: [1, 2] }, { edge: 'bottom', i: [3, 2] }, { edge: 'left', i: [0, 3] }];
  const close = () => (app.calibEditPhotoId = null);

  $effect(() => { assetUrl(photo.assetId).then((u) => (url = u)); });
  $effect(() => {
    const fit = () => { if (host) scale = Math.min(host.clientWidth / photo.w, host.clientHeight / photo.h); };
    const ro = new ResizeObserver(fit); ro.observe(host); fit();
    return () => ro.disconnect();
  });

  const toPhoto = (e: PointerEvent): Pt => {
    const r = svg.getBoundingClientRect();
    return [Math.max(0, Math.min(photo.w, (e.clientX - r.left) / scale)), Math.max(0, Math.min(photo.h, (e.clientY - r.top) / scale))];
  };
  function down(e: PointerEvent, objectId: string, index: number) {
    if (!app.canEdit) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { objectId, index, pointerId: e.pointerId };
    loupeAt = toPhoto(e);
    drawLoupe();
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const p = toPhoto(e);
    app.setCalibVertex(photo.id, drag.objectId, drag.index, p);
    loupeAt = p;
    drawLoupe();
  }
  function up() { drag = null; loupeAt = null; }

  /** 끌고 있는 꼭짓점 주변을 3배로 확대해 보여 준다 (사진 원본 해상도 기준) */
  function drawLoupe() {
    if (!loupe || !img || !loupeAt) return;
    const ctx = loupe.getContext('2d')!;
    const size = loupe.width, half = size / 2 / LOUPE;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, loupeAt[0] - half, loupeAt[1] - half, half * 2, half * 2, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,204,0,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="기준선 직접 조정" data-testid="calib-edit-dialog">
    <header>
      <h2>기준선 직접 조정 · {photo.name}</h2>
      <small>꼭짓점(○)을 끌어 사진 속 실제 모서리에 맞추세요. 굵은 선 = 기준선(노랑 가로, 파랑 세로)</small>
      <button class="icon" data-testid="close-calib-edit" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="body">
      <div class="view" bind:this={host}>
        {#if url}
          <div class="stage" style:width="{photo.w * scale}px" style:height="{photo.h * scale}px">
            <img bind:this={img} src={url} alt={photo.name} draggable="false" crossorigin="anonymous" />
            <svg bind:this={svg} data-testid="calib-edit-svg" data-scale={scale} viewBox="0 0 {photo.w} {photo.h}" role="presentation" onpointermove={move} onpointerup={up} onpointercancel={up}>
              {#each objects as o (o.id)}
                {@const q = quadOf(o.id, o.quad)}
                {#each EDGES as e (e.edge)}
                  {@const r = refOf(o.id, e.edge)}
                  <line class="edge" class:h={r?.kind === 'h'} class:v={r?.kind === 'v'} class:manual={r?.manual} x1={q[e.i[0]][0]} y1={q[e.i[0]][1]} x2={q[e.i[1]][0]} y2={q[e.i[1]][1]} stroke-width={(r ? 3 : 1) / scale} />
                {/each}
                <text x={q[0][0]} y={q[0][1] - 8 / scale} font-size={12 / scale} stroke-width={3 / scale}>{o.name}</text>
                {#each q as p, i (i)}
                  <circle data-testid="calib-vertex" class="vertex" class:on={drag?.objectId === o.id && drag.index === i} cx={p[0]} cy={p[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, o.id, i)} />
                {/each}
              {/each}
            </svg>
            {#if loupeAt}
              <canvas bind:this={loupe} class="loupe" width="180" height="180" style:left="{Math.min(photo.w * scale - 190, loupeAt[0] * scale + 20)}px" style:top="{Math.max(10, loupeAt[1] * scale - 200)}px"></canvas>
            {/if}
          </div>
        {:else}
          <div class="status">사진 불러오는 중…</div>
        {/if}
      </div>
      <aside>
        <h3>기준선</h3>
        <ul>
          {#each ev?.refs ?? [] as r (r.objectId + r.edge)}
            <li data-testid="calib-ref" class:bad={Math.abs(r.deviation) > 0.1}>
              <span>{nameOf(r.objectId)} · {LABEL[r.edge]} ({r.kind === 'h' ? '가로' : '세로'}, {r.mm.toLocaleString('ko-KR')}mm)</span>
              <small>{r.manual ? '직접 조정' : r.confidence >= 0.2 ? `AI 보정 ${r.offset > 0 ? '+' : ''}${r.offset}px` : 'AI 보정 없음'} · 편차 {(r.deviation * 100).toFixed(1)}%</small>
            </li>
          {/each}
        </ul>
        {#each ev?.warnings ?? [] as w, i (i)}<p class="warn">⚠ {w}</p>{/each}
        <p class="hint">기준선이 아닌 변도 소실점 계산에 쓰이므로 함께 맞추면 정확해집니다. 끌면 편차가 바로 갱신됩니다.</p>
        {#if app.canEdit}
          <div class="actions">
            <button class="btn small" data-testid="calib-edit-eval" disabled={app.calibBusy} onclick={() => app.evaluateCalibration(photo.id)}>{app.calibBusy ? '평가 중…' : 'AI 다시 평가'}</button>
            <button class="btn small primary" data-testid="calib-edit-apply" onclick={() => { app.applyCalibration(photo.id); close(); }}>적용</button>
          </div>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1280px, calc(100vw - 32px)); height: min(860px, calc(100vh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; }
  header small { flex: 1; color: var(--muted); font-size: 12px; }
  .body { flex: 1; display: grid; grid-template-columns: 1fr 280px; min-height: 0; }
  .view { position: relative; display: grid; place-items: center; background: #0a0c10; overflow: hidden; }
  .stage { position: relative; }
  .stage img { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; }
  .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .edge { stroke: rgba(255,255,255,0.55); }
  .edge.h { stroke: var(--accent); }
  .edge.v { stroke: var(--blue); }
  .edge.manual { stroke-dasharray: 4 3; }
  .vertex { fill: #fff; stroke: var(--accent); cursor: grab; }
  .vertex.on { fill: var(--accent); cursor: grabbing; }
  text { fill: #fff; stroke: rgba(0,0,0,0.75); paint-order: stroke; font-weight: 600; pointer-events: none; }
  .loupe { position: absolute; width: 180px; height: 180px; border: 2px solid var(--accent); border-radius: 50%; background: #000; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
  .status { color: var(--muted); }
  aside { border-left: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
  h3 { margin: 0; font-size: 12px; color: var(--muted); }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
  li { display: flex; flex-direction: column; font-size: 12px; padding: 4px 6px; border-radius: 6px; background: var(--input); }
  li.bad { outline: 1px solid var(--warn); }
  li small { color: var(--muted); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  .hint { color: var(--muted); font-size: 11px; margin: 0; }
  .actions { display: flex; gap: 6px; margin-top: auto; }
</style>
