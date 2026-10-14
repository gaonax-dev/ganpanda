<!-- 카메라 설정 창 (fSpy 방식, 자체 구현): 가로 X 선 2개(노랑)·세로 Y 선 2개(파랑)·선택 깊이 Z 선 2개(초록), 원점(흰 십자), 기준 길이(빨강 + mm).
     AI 자동 제안 → 사람이 끌어 제어 → 적용. 끌 때 3배 돋보기 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { Pt } from '../core/homography';
  import type { Photo } from '../core/model';
  import type { Axis, CameraSetup, Line } from '../core/camera';

  let { photo }: { photo: Photo } = $props();
  let url = $state<string | undefined>(undefined);
  let img: HTMLImageElement | undefined = $state(undefined);
  let svg: SVGSVGElement = $state()!;
  let host: HTMLDivElement = $state()!;
  let scale = $state(1); // 화면 px / 사진 px
  let drag: { key: string; pointerId: number } | null = $state(null);
  let loupe: HTMLCanvasElement | undefined = $state(undefined);
  let loupeAt = $state<Pt | null>(null);
  let proposeFailed = $state(false);
  const LOUPE = 3;

  const draft = $derived(app.cameraDraft!);
  const sol = $derived(app.cameraDraftSolution);
  const ro = $derived(!app.canEdit);
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const close = () => app.closeCamera();
  const set = (patch: Partial<CameraSetup>) => { app.cameraDraft = { ...draft, ...patch }; };

  $effect(() => { assetUrl(photo.assetId).then((u) => (url = u)); });
  $effect(() => {
    const fit = () => { if (host) scale = Math.min(host.clientWidth / photo.w, host.clientHeight / photo.h); };
    const ro2 = new ResizeObserver(fit); ro2.observe(host); fit();
    return () => ro2.disconnect();
  });

  /** 핸들 키: "x0a" = x 축 0번 선의 a 끝점, "o" = 원점, "ra"/"rb" = 기준 길이 끝점 */
  const AXES: { axis: Axis; label: string; cls: string }[] = [{ axis: 'x', label: '가로 X', cls: 'ax' }, { axis: 'y', label: '세로 Y', cls: 'ay' }, { axis: 'z', label: '깊이 Z', cls: 'az' }];
  const linesOf = (axis: Axis): [Line, Line] | undefined => (axis === 'x' ? draft.x : axis === 'y' ? draft.y : draft.z);
  const toPhoto = (e: PointerEvent): Pt => {
    const r = svg.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(photo.w, (e.clientX - r.left) / scale))), Math.round(Math.max(0, Math.min(photo.h, (e.clientY - r.top) / scale)))];
  };
  function setHandle(key: string, p: Pt) {
    if (key === 'o') { set({ origin: p }); return; }
    if (key === 'ra' || key === 'rb') { if (draft.ref) set({ ref: { ...draft.ref, [key === 'ra' ? 'a' : 'b']: p } }); return; }
    const axis = key[0] as Axis, i = Number(key[1]), end = key[2] as 'a' | 'b';
    const lines = linesOf(axis);
    if (!lines) return;
    const next = lines.map((l, j) => (j === i ? { ...l, [end]: p } : l)) as [Line, Line];
    set({ [axis]: next } as Partial<CameraSetup>);
  }
  function down(e: PointerEvent, key: string) {
    if (ro) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { key, pointerId: e.pointerId };
    loupeAt = toPhoto(e); drawLoupe();
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const p = toPhoto(e);
    setHandle(drag.key, p);
    loupeAt = p; drawLoupe();
  }
  function up() { drag = null; loupeAt = null; }
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
  function toggleZ() {
    if (draft.z) { set({ z: undefined, principal: 'center' }); return; }
    const w = photo.w, h = photo.h;
    set({ z: [{ a: [w * 0.1, h * 0.35], b: [w * 0.3, h * 0.4] }, { a: [w * 0.1, h * 0.65], b: [w * 0.3, h * 0.6] }] });
  }
  async function propose() { proposeFailed = !(await app.proposeCamera()); }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="카메라 설정" data-testid="camera-dialog">
    <header>
      <h2>카메라 설정 · {photo.name}</h2>
      <small>벽의 확실한 직선(줄눈·창틀·문틀)에 가로 선 2개·세로 선 2개를 맞추고, 원점과 실측한 기준 길이를 놓으세요.</small>
      <button class="icon" data-testid="close-camera" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="body">
      <div class="view" bind:this={host}>
        {#if url}
          <div class="stage" style:width="{photo.w * scale}px" style:height="{photo.h * scale}px">
            <img bind:this={img} src={url} alt={photo.name} draggable="false" crossorigin="anonymous" />
            <svg bind:this={svg} data-testid="camera-svg" data-scale={scale} viewBox="0 0 {photo.w} {photo.h}" role="presentation" onpointermove={move} onpointerup={up} onpointercancel={up}>
              {#each AXES as ax (ax.axis)}
                {@const lines = linesOf(ax.axis)}
                {#if lines}
                  {#each lines as l, i (i)}
                    <line class="axis {ax.cls}" x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={3 / scale} />
                    {#each ['a', 'b'] as end (end)}
                      {@const p = l[end as 'a' | 'b']}
                      <circle data-testid="camera-handle" data-key="{ax.axis}{i}{end}" class="handle {ax.cls}" class:on={drag?.key === `${ax.axis}${i}${end}`} cx={p[0]} cy={p[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, `${ax.axis}${i}${end}`)} />
                    {/each}
                  {/each}
                {/if}
              {/each}
              {#if draft.ref}
                <line class="axis ref" x1={draft.ref.a[0]} y1={draft.ref.a[1]} x2={draft.ref.b[0]} y2={draft.ref.b[1]} stroke-width={3 / scale} />
                <text x={(draft.ref.a[0] + draft.ref.b[0]) / 2} y={(draft.ref.a[1] + draft.ref.b[1]) / 2 - 10 / scale} font-size={13 / scale} stroke-width={3 / scale} text-anchor="middle">{fmt(draft.ref.mm)}mm</text>
                {#each ['ra', 'rb'] as key (key)}
                  {@const p = key === 'ra' ? draft.ref.a : draft.ref.b}
                  <circle data-testid="camera-handle" data-key={key} class="handle ref" class:on={drag?.key === key} cx={p[0]} cy={p[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, key)} />
                {/each}
              {/if}
              <g class="origin" transform="translate({draft.origin[0]} {draft.origin[1]})">
                <line x1={-14 / scale} x2={14 / scale} y1="0" y2="0" stroke-width={2 / scale} /><line y1={-14 / scale} y2={14 / scale} x1="0" x2="0" stroke-width={2 / scale} />
                <circle data-testid="camera-handle" data-key="o" class="handle origin" class:on={drag?.key === 'o'} r={8 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, 'o')} />
              </g>
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
        <section>
          <h3>AI 제안</h3>
          <div class="row">
            <button class="btn small" data-testid="camera-propose" disabled={ro || app.cameraBusy} onclick={propose}>{app.cameraBusy ? '분석 중…' : '축 선 자동 제안'}</button>
            <button class="btn small" data-testid="camera-snap" disabled={ro || app.cameraBusy} title="선 끝점을 사진 속 모서리에 붙입니다" onclick={() => app.snapCamera()}>모서리에 붙이기</button>
          </div>
          {#if proposeFailed}<p class="warn" data-testid="camera-propose-failed">뚜렷한 직선을 찾지 못했습니다. 선을 직접 놓으세요.</p>{/if}
        </section>
        <section>
          <h3>기준 길이 <span class="legend ref">■</span></h3>
          {#if draft.ref}
            <div class="row">
              <input data-testid="camera-ref-mm" type="number" min="1" step="10" value={draft.ref.mm} disabled={ro} oninput={(e) => set({ ref: { ...draft.ref!, mm: Math.max(1, Number(e.currentTarget.value) || 1) } })} />
              <span>mm</span>
              <select data-testid="camera-ref-axis" value={draft.ref.axis} disabled={ro} onchange={(e) => set({ ref: { ...draft.ref!, axis: e.currentTarget.value as 'x' | 'y' } })}>
                <option value="x">가로 방향</option><option value="y">세로 방향</option>
              </select>
            </div>
            <p class="hint">빨간 선을 실측한 곳(문 폭, 창 높이 등)에 맞추고 길이를 넣으세요. 가로·세로 축을 따라 놓아야 합니다.</p>
          {/if}
        </section>
        <section>
          <h3>축 선 <span class="legend ax">■</span> 가로 <span class="legend ay">■</span> 세로 <span class="legend az">■</span> 깊이</h3>
          <label class="check"><input type="checkbox" data-testid="camera-z" checked={!!draft.z} disabled={ro} onchange={toggleZ} /> 깊이 축(옆면 벽) 선 2개 추가</label>
          <label class="check"><input type="checkbox" data-testid="camera-principal" checked={draft.principal === 'third'} disabled={ro || !draft.z} onchange={(e) => set({ principal: e.currentTarget.checked ? 'third' : 'center' })} /> 세 소실점으로 주점 계산 (잘라낸 사진)</label>
          <p class="hint">흰 십자 = 원점(벽 좌표 0,0). 보통 벽의 왼쪽 아래 모서리.</p>
        </section>
        <section data-testid="camera-result">
          <h3>결과</h3>
          {#if sol}
            <small>초점거리 {fmt(sol.f)}px · 주점 ({fmt(sol.pp[0])}, {fmt(sol.pp[1])})</small>
            {#each sol.warnings as w, i (i)}<p class="warn" data-testid="camera-warning">⚠ {w}</p>{/each}
          {:else}
            <p class="warn">카메라를 풀 수 없습니다. 선·원점을 확인하세요.</p>
          {/if}
        </section>
        {#if !ro}
          <div class="actions">
            <button class="btn small primary" data-testid="camera-apply" disabled={!sol} onclick={() => app.applyCamera()}>적용</button>
            <button class="btn small" onclick={close}>취소</button>
          </div>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1320px, calc(100vw - 32px)); height: min(880px, calc(100vh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; }
  header small { flex: 1; color: var(--muted); font-size: 12px; }
  .body { flex: 1; display: grid; grid-template-columns: 1fr 300px; min-height: 0; }
  .view { position: relative; display: grid; place-items: center; background: #0a0c10; overflow: hidden; }
  .stage { position: relative; }
  .stage img { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; }
  .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .axis.ax { stroke: var(--accent); } .axis.ay { stroke: var(--blue); } .axis.az { stroke: #3ddc84; } .axis.ref { stroke: #ff4d4d; }
  .handle { fill: #fff; cursor: grab; }
  .handle.ax { stroke: var(--accent); } .handle.ay { stroke: var(--blue); } .handle.az { stroke: #3ddc84; } .handle.ref { stroke: #ff4d4d; } .handle.origin { stroke: #fff; fill: rgba(255,255,255,0.15); }
  .handle.on { fill: var(--accent); cursor: grabbing; }
  .origin line { stroke: #fff; }
  text { fill: #fff; stroke: rgba(0,0,0,0.75); paint-order: stroke; font-weight: 700; pointer-events: none; }
  .loupe { position: absolute; width: 180px; height: 180px; border: 2px solid var(--accent); border-radius: 50%; background: #000; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
  .status { color: var(--muted); }
  aside { border-left: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .legend.ax { color: var(--accent); } .legend.ay { color: var(--blue); } .legend.az { color: #3ddc84; } .legend.ref { color: #ff4d4d; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .row input[type='number'] { width: 90px; }
  .check { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .hint { color: var(--muted); font-size: 11px; margin: 0; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  small { color: var(--muted); font-size: 11px; }
  .actions { display: flex; gap: 6px; margin-top: auto; }
</style>
