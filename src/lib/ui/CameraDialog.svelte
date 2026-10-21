<!-- 카메라 설정 창 (fSpy 방식, 자체 구현): 가로 X 선 2개(노랑)·세로 Y 선 2개(파랑)·선택 깊이 Z 선 2개(초록), 원점(흰 십자), 기준 길이(빨강 + mm).
     AI 자동 제안 → 사람이 끌어 제어 → 적용. 돋보기는 Shift 를 누른 동안만 (2026-10-14 사용자: 기본 끌기엔 필요 없음) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { Pt } from '../core/homography';
  import type { Photo } from '../core/model';
  import { AXIS_COLOR, REF_COLOR, pairAxes, refLineOf, snapToAxis, type Axis, type AxisDir, type CameraSetup, type Line } from '../core/camera';
  import { projectVisible, type CameraPose } from '../core/homography';

  let { photo }: { photo: Photo } = $props();
  let url = $state<string | undefined>(undefined);
  let img: HTMLImageElement | undefined = $state(undefined);
  let svg: SVGSVGElement = $state()!;
  let host: HTMLDivElement = $state()!;
  let scale = $state(1); // 화면 px / 사진 px
  let drag: { key: string; pointerId: number; start?: { p: Pt; from: Pt; to: Pt } } | null = $state(null);
  let loupe: HTMLCanvasElement | undefined = $state(undefined);
  let loupeAt = $state<Pt | null>(null);
  /** Shift 를 누른 동안만 돋보기 */
  let shift = $state(false);
  let proposeFailed = $state(false);
  const LOUPE = 3;

  const draft = $derived(app.cameraDraft!);
  const sol = $derived(app.cameraDraftSolution);
  const ro = $derived(!app.canEdit);
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const close = () => app.closeCamera();
  let show3d = $state(true);
  /** fSpy 처럼 풀린 카메라를 3D 로 바로 보여 준다: 벽면 1m 격자(원점 기준), 축 X·Y·Z, 1m 상자 */
  const overlay = $derived.by(() => {
    if (!sol) return null;
    const pose: CameraPose = sol.pose;
    const seg = (a: [number, number, number], b: [number, number, number]) => { const p = projectVisible(pose, a), q = projectVisible(pose, b); return p && q ? { a: p, b: q } : null; };
    const step = 1000, nx = 6, ny = 4;
    const grid: { a: Pt; b: Pt }[] = [];
    for (let i = -1; i <= nx; i++) { const s = seg([i * step, -step, 0], [i * step, ny * step, 0]); if (s) grid.push(s); }
    for (let j = -1; j <= ny; j++) { const s = seg([-step, j * step, 0], [nx * step, j * step, 0]); if (s) grid.push(s); }
    // 월드 축 (지정한 라벨대로): 월드 점 p → 카메라 = Rw·p + t 를 벽면 좌표로 바꿔 투영
    const Rw = sol.worldR, Rp = pose.R;
    const toWall = (p: [number, number, number]): [number, number, number] => {
      const cx = Rw[0] * p[0] + Rw[1] * p[1] + Rw[2] * p[2], cy = Rw[3] * p[0] + Rw[4] * p[1] + Rw[5] * p[2], cz = Rw[6] * p[0] + Rw[7] * p[1] + Rw[8] * p[2];
      return [Rp[0] * cx + Rp[3] * cy + Rp[6] * cz, Rp[1] * cx + Rp[4] * cy + Rp[7] * cz, Rp[2] * cx + Rp[5] * cy + Rp[8] * cz];
    };
    const axes = { x: seg([0, 0, 0], toWall([step, 0, 0])), y: seg([0, 0, 0], toWall([0, step, 0])), z: seg([0, 0, 0], toWall([0, 0, step])) };
    const c = (x: number, y: number, z: number): [number, number, number] => [x * step, y * step, z * step];
    const E: [[number, number, number], [number, number, number]][] = [
      [c(0,0,0), c(1,0,0)], [c(1,0,0), c(1,1,0)], [c(1,1,0), c(0,1,0)], [c(0,1,0), c(0,0,0)],
      [c(0,0,1), c(1,0,1)], [c(1,0,1), c(1,1,1)], [c(1,1,1), c(0,1,1)], [c(0,1,1), c(0,0,1)],
      [c(0,0,0), c(0,0,1)], [c(1,0,0), c(1,0,1)], [c(1,1,0), c(1,1,1)], [c(0,1,0), c(0,1,1)],
    ];
    const cube = E.map(([a, b]) => seg(a, b)).filter((s): s is { a: Pt; b: Pt } => !!s);
    return { grid, axes, cube };
  });
  const set = (patch: Partial<CameraSetup>) => { app.cameraDraft = { ...draft, ...patch }; };

  $effect(() => { void app.assetEpoch; assetUrl(photo.assetId).then((u) => (url = u)); });
  $effect(() => {
    const fit = () => { if (host) scale = Math.min(host.clientWidth / photo.w, host.clientHeight / photo.h); };
    const ro2 = new ResizeObserver(fit); ro2.observe(host); fit();
    return () => ro2.disconnect();
  });

  /** 핸들 키: "x0a" = x 축 0번 선의 a 끝점, "o" = 원점, "ra"/"rb" = 기준 길이 끝점 */
  // 선 쌍 그리기 색: 첫 쌍(데이터 키 x) 노랑, 둘째 쌍(키 y) 파랑, 셋째 쌍(키 z) 초록 — 축 이름은 아래 DIRS 지정으로
  const AXES: { axis: Axis; label: string; cls: string }[] = [{ axis: 'x', label: '첫 쌍', cls: 'ax' }, { axis: 'y', label: '둘째 쌍', cls: 'ay' }, { axis: 'z', label: '셋째 쌍', cls: 'az' }];
  /** 선 쌍의 색 = 지정된 월드 축 색 (기준선과 중심선이 같은 색이 되게, 2026-10-14 사용자) */
  const pairWorld = $derived(pairAxes(draft));
  const pairColor = (pair: Axis) => AXIS_COLOR[pairWorld[pair === 'x' ? 0 : pair === 'y' ? 1 : 2]];
  /** fSpy 식 축 지정: 첫 쌍(노랑)·둘째 쌍(파랑). 가로·세로·높이 관례: X 가로, Y 세로(깊이), Z 높이. 'auto' = +X 가로, +Z 높이 */
  const DIRS: { id: AxisDir; label: string }[] = [{ id: '+x', label: '+X 가로 (오른쪽) 빨강' }, { id: '-x', label: '−X 가로 (왼쪽) 빨강' }, { id: '+y', label: '+Y 세로·깊이 (벽 안쪽) 초록' }, { id: '-y', label: '−Y 세로·깊이 (벽 앞쪽) 초록' }, { id: '+z', label: '+Z 높이 (위) 파랑' }, { id: '-z', label: '−Z 높이 (아래) 파랑' }];
  /** 같은 축을 피해 다른 축으로: 가로↔높이, 세로면 (첫째) 가로 / (둘째) 높이 */
  const other = (a: AxisDir, which: 'first' | 'second'): AxisDir => (a[1] === 'x' ? '+z' : a[1] === 'z' ? '+x' : which === 'first' ? '+x' : '+z');
  const AXIS_NAME = { x: '가로 X', y: '세로 Y', z: '높이 Z' } as const;
  const remaining = $derived(sol ? (['x', 'y', 'z'] as const).find((k) => k !== sol.axesUsed.first[1] && k !== sol.axesUsed.second[1])! : 'y');
  function setAxis(which: 'first' | 'second', v: string) {
    if (v === 'auto') { set({ axes: undefined }); return; }
    const cur = draft.axes ?? { first: '+x' as AxisDir, second: '+z' as AxisDir };
    const next = { ...cur, [which]: v as AxisDir };
    // 다른 쌍이 같은 축이면 반대 축으로
    const o = which === 'first' ? 'second' : 'first';
    if (next[o][1] === (v as AxisDir)[1]) next[o] = other(v as AxisDir, o);
    set({ axes: next });
  }
  const m = (mm: number) => (mm / 1000).toFixed(2);
  /**
   * 기준 길이 (2026-10-14 사용자: "중심선들 중에 하나 선택하고 그 선 안에서 길이 변경하고 기준길이 넣는다"):
   * 축(X/Y/Z) 하나를 **목록에서** 고르면(사진의 선을 눌러 바꾸던 것은 2026-10-18 제거 — 끌다가 축이 바뀜) 그 축 선 위에 기준 선분(from→to)이 놓이고 양 끝 핸들이 선 위에서만 움직인다(원점의 −쪽·+쪽 모두, 선분을 잡으면 전체 이동),
   * 그 선의 실제 길이(mm)를 넣는다. 고르지 않은 두 중심선은 1m 길이로 그려진다. 옛 형식(from/to, 선 선택)은 편집하는 순간 이 형식으로
   */
  const refAxis = $derived<'x' | 'y' | 'z'>(draft.ref && ('from' in draft.ref || 'point' in draft.ref) ? draft.ref.axis : 'x');
  const refMm = $derived(draft.ref?.mm ?? 0);
  const refLine = $derived(refLineOf(draft, false, sol ?? undefined));
  const REF_AXIS_LABEL = { x: 'X 가로 (빨강)', y: 'Y 세로 (초록)', z: 'Z 높이 (파랑)' } as const;
  /**
   * 기준 길이 선분의 양 끝 (축 선 위, 원점의 −쪽·+쪽 어디든). 시작도 끌 수 있고(2026-10-18 사용자: "시작도 컨트롤 가능하게"), 없으면 원점에서 축 방향으로
   * 떨어진 자리에 둔다 — 원점 핸들과 겹치면 처음 잡기 어렵다("원점에 있으면 처음 선택이 어려우니 센터에서 떨어진 자리에"). 옛 point 형식은 원점→점
   */
  function refEnds(axis: 'x' | 'y' | 'z'): [Pt, Pt] {
    const r = draft.ref;
    let a: Pt, b: Pt;
    if (r && 'from' in r && r.axis === axis) { a = r.from; b = r.to; }
    else if (r && 'point' in r && r.axis === axis) { a = draft.origin; b = r.point; }
    else {
      const dir = sol ? sol.axisImageDir[axis] : ([1, 0] as Pt); const L = Math.min(photo.w, photo.h);
      a = [draft.origin[0] + dir[0] * L * 0.15, draft.origin[1] + dir[1] * L * 0.15]; b = [draft.origin[0] + dir[0] * L * 0.45, draft.origin[1] + dir[1] * L * 0.45];
    }
    return sol ? [snapToAxis(sol, axis, a), snapToAxis(sol, axis, b)] : [a, b];
  }
  const setRef = (axis: 'x' | 'y' | 'z', from: Pt, to: Pt, mm: number) => set({ ref: { axis, from, to, mm } });
  function setRefAxis(axis: 'x' | 'y' | 'z') { const [from, to] = refEnds(axis); setRef(axis, from, to, draft.ref?.mm || 1000); }
  const setRefMm = (mm: number) => { const [from, to] = refEnds(refAxis); setRef(refAxis, from, to, Math.max(1, mm || 1)); };
  /** 방향바(중심선) 끝: 원점에서 1m. 기준 길이가 있는 축은 방향바 대신 기준 선분만 그린다 (2026-10-18 사용자: "길이가 있는 쪽은 방향바 없도록") */
  const centerEnd = (axis: 'x' | 'y' | 'z'): Pt | null => (axis === refAxis ? null : overlay?.axes[axis]?.b ?? null);
  const linesOf = (axis: Axis): [Line, Line] | undefined => (axis === 'x' ? draft.x : axis === 'y' ? draft.y : draft.z);
  const toPhoto = (e: PointerEvent): Pt => {
    const r = svg.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(photo.w, (e.clientX - r.left) / scale))), Math.round(Math.max(0, Math.min(photo.h, (e.clientY - r.top) / scale)))];
  };
  function setHandle(key: string, p: Pt) {
    if (key === 'o') {
      // 원점(피봇)을 옮기면 기준 길이 끝점도 같은 만큼 따라간다 (2026-10-14 사용자) — 축 위로는 풀이 때 다시 붙는다
      const d: Pt = [p[0] - draft.origin[0], p[1] - draft.origin[1]];
      const r = draft.ref;
      if (r && ('point' in r || 'from' in r)) {
        const [a, b] = refEnds(r.axis);
        set({ origin: p, ref: { axis: r.axis, from: [a[0] + d[0], a[1] + d[1]], to: [b[0] + d[0], b[1] + d[1]], mm: r.mm } });
      } else set({ origin: p });
      return;
    }
    if (key === 'ra' || key === 'rb') {
      const [a, b] = refEnds(refAxis), q = sol ? snapToAxis(sol, refAxis, p) : p;
      setRef(refAxis, key === 'ra' ? q : a, key === 'rb' ? q : b, refMm || 1000);
      return;
    }
    if (key === 'rl') { // 선분을 잡으면 길이 그대로 축을 따라 전체 이동 (2026-10-18 사용자: "길이 라인을 잡으면 길이 전체이동")
      const st = drag?.start;
      if (!st) return;
      let d: Pt = [p[0] - st.p[0], p[1] - st.p[1]];
      if (sol) { const dir = sol.axisImageDir[refAxis], n2 = dir[0] * dir[0] + dir[1] * dir[1]; if (n2 > 1e-12) { const t = (d[0] * dir[0] + d[1] * dir[1]) / n2; d = [dir[0] * t, dir[1] * t]; } }
      setRef(refAxis, [st.from[0] + d[0], st.from[1] + d[1]], [st.to[0] + d[0], st.to[1] + d[1]], refMm || 1000);
      return;
    }
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
    const [from, to] = refEnds(refAxis);
    drag = { key, pointerId: e.pointerId, ...(key === 'rl' ? { start: { p: toPhoto(e), from, to } } : {}) };
    shift = e.shiftKey;
    loupeAt = toPhoto(e); drawLoupe();
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const p = toPhoto(e);
    setHandle(drag.key, p);
    shift = e.shiftKey;
    loupeAt = p; drawLoupe();
  }
  function up() { drag = null; loupeAt = null; }
  $effect(() => { if (shift && loupeAt && loupe) drawLoupe(); });
  function drawLoupe() {
    if (!loupe || !img || !loupeAt || !shift) return;
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

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Shift') { shift = true; drawLoupe(); } }} onkeyup={(e) => { if (e.key === 'Shift') shift = false; }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="사진 원근 맞추기" data-testid="camera-dialog">
    <header>
      <h2>사진 원근 맞추기 · {photo.name}</h2>
      <small>이 사진에서 치수를 재고 실사를 합성하려면: 벽의 확실한 직선에 <b>가로 선 2개(X 빨강)·높이 선 2개(Z 파랑)</b>를 맞추고, <b>원점</b>과 <b>실측한 길이 하나</b>를 놓으세요. 사진마다 따로 합니다. 정밀하게 맞출 땐 <b>Shift</b> 를 누른 채 끌면 돋보기.</small>
      <button class="icon" data-testid="close-camera" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="body">
      <div class="view" bind:this={host}>
        {#if url}
          <div class="stage" style:width="{photo.w * scale}px" style:height="{photo.h * scale}px">
            <img bind:this={img} src={url} alt={photo.name} draggable="false" crossorigin="anonymous" />
            <svg bind:this={svg} data-testid="camera-svg" data-scale={scale} viewBox="0 0 {photo.w} {photo.h}" role="presentation" onpointermove={move} onpointerup={up} onpointercancel={up}>
              {#if show3d && overlay}
                <g class="overlay" data-testid="camera-3d" pointer-events="none">
                  {#each overlay.grid as s, i (i)}<line class="g" x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke-width={1 / scale} />{/each}
                  {#each overlay.cube as s, i (i)}<line class="cube" x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke-width={1.5 / scale} />{/each}
                </g>
              {/if}
              <!-- 방향바(중심선, 원점 축 X·Y·Z, 1m): 기준 길이 축은 목록(camera-ref-axis)에서만 고른다 (2026-10-18 사용자: "방향막대를 클릭하면 변경되는데 이거 제거"). 기준 길이가 있는 축은 방향바 대신 아래 기준 선분 -->
              {#if sol}
                {#each (['x', 'y', 'z'] as const) as axis (axis)}
                  {@const end = centerEnd(axis)}
                  {#if end}
                    <line class="center" data-testid="camera-center-line" data-axis={axis} style:stroke={AXIS_COLOR[axis]} x1={draft.origin[0]} y1={draft.origin[1]} x2={end[0]} y2={end[1]} stroke-width={3 / scale} pointer-events="none" />
                    <text class="axlabel" style:fill={AXIS_COLOR[axis]} x={end[0]} y={end[1] - 8 / scale} font-size={14 / scale} stroke-width={3 / scale}>{axis.toUpperCase()}</text>
                  {/if}
                {/each}
              {/if}
              {#each AXES as ax (ax.axis)}
                {@const lines = linesOf(ax.axis)}
                {#if lines}
                  {#each lines as l, i (i)}
                    <line class="axis {ax.cls}" data-testid="camera-line" data-key="{ax.axis}{i}" style:stroke={pairColor(ax.axis)} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke-width={3 / scale} />
                    {#each ['a', 'b'] as end (end)}
                      {@const p = l[end as 'a' | 'b']}
                      <circle data-testid="camera-handle" data-key="{ax.axis}{i}{end}" class="handle {ax.cls}" style:stroke={pairColor(ax.axis)} class:on={drag?.key === `${ax.axis}${i}${end}`} cx={p[0]} cy={p[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, `${ax.axis}${i}${end}`)} />
                    {/each}
                  {/each}
                {/if}
              {/each}
              {#if refLine && sol}
                <!-- 기준 길이 선분: 축 선 위 from→to, 양 끝 핸들(ra·rb), 선분을 잡으면 전체 이동(rl) — 2026-10-18 -->
                <line class="refglow" x1={refLine.a[0]} y1={refLine.a[1]} x2={refLine.b[0]} y2={refLine.b[1]} stroke-width={11 / scale} pointer-events="none" />
                <line class="refline" data-testid="camera-ref-line" data-axis={refAxis} style:stroke={AXIS_COLOR[refAxis]} x1={refLine.a[0]} y1={refLine.a[1]} x2={refLine.b[0]} y2={refLine.b[1]} stroke-width={4 / scale} pointer-events="none" />
                <line class="refhit" data-testid="camera-ref-hit" x1={refLine.a[0]} y1={refLine.a[1]} x2={refLine.b[0]} y2={refLine.b[1]} stroke-width={16 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, 'rl')} />
                <text class="axlabel" style:fill={AXIS_COLOR[refAxis]} x={refLine.b[0]} y={refLine.b[1] - 8 / scale} font-size={14 / scale} stroke-width={3 / scale}>{refAxis.toUpperCase()}</text>
                <text class="reflabel" x={(refLine.a[0] + refLine.b[0]) / 2} y={(refLine.a[1] + refLine.b[1]) / 2 - 12 / scale} font-size={13 / scale} stroke-width={3 / scale} text-anchor="middle">{fmt(refMm)}mm</text>
                <circle data-testid="camera-handle" data-key="ra" class="handle ref" class:on={drag?.key === 'ra'} cx={refLine.a[0]} cy={refLine.a[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, 'ra')} />
                <circle data-testid="camera-handle" data-key="rb" class="handle ref" class:on={drag?.key === 'rb'} cx={refLine.b[0]} cy={refLine.b[1]} r={7 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, 'rb')} />
              {/if}
              <g class="origin" transform="translate({draft.origin[0]} {draft.origin[1]})">
                <line x1={-14 / scale} x2={14 / scale} y1="0" y2="0" stroke-width={2 / scale} /><line y1={-14 / scale} y2={14 / scale} x1="0" x2="0" stroke-width={2 / scale} />
                <circle data-testid="camera-handle" data-key="o" class="handle origin" class:on={drag?.key === 'o'} r={8 / scale} stroke-width={2 / scale} role="button" tabindex="-1" onpointerdown={(e) => down(e, 'o')} />
              </g>
            </svg>
            {#if loupeAt && shift}
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
            <button class="btn small" data-testid="camera-propose" disabled={ro || app.cameraBusy} title="가로에 가까운 선 쌍 → X 가로. 둘째 쌍은 세로에 가까우면 Z 높이(정면 사진), 비스듬하면 Y 깊이(45° 사진)로 자동. 아래 축 선에서 바꿀 수 있습니다" onclick={propose}>{app.cameraBusy ? '분석 중…' : '축 선 자동 제안'}</button>
            <button class="btn small" data-testid="camera-snap" disabled={ro || app.cameraBusy} title="선 끝점을 사진 속 모서리에 붙입니다" onclick={() => app.snapCamera()}>모서리에 붙이기</button>
          </div>
          {#if proposeFailed}<p class="warn" data-testid="camera-propose-failed">뚜렷한 직선을 찾지 못했습니다. 선을 직접 놓으세요.</p>{/if}
        </section>
        <section>
          <h3>기준 길이 <span class="legend" style:color={REF_COLOR}>■</span></h3>
          <div class="row">
            <select data-testid="camera-ref-axis" value={refAxis} disabled={ro} onchange={(e) => setRefAxis(e.currentTarget.value as 'x' | 'y' | 'z')}>
              {#each Object.entries(REF_AXIS_LABEL) as [k, label] (k)}<option value={k}>{label}</option>{/each}
            </select>
            <input data-testid="camera-ref-mm" type="number" min="1" step="10" value={refMm || ''} placeholder="실측 거리" disabled={ro} oninput={(e) => setRefMm(Number(e.currentTarget.value))} />
            <span>mm</span>
          </div>
          <p class="hint"><b>축(X·Y·Z)을 목록에서 고르면</b> 그 축 선 위에 자홍으로 빛나는 <b>기준 선분</b>이 놓입니다. 양 끝 핸들을 축 선 위에서(원점의 어느 쪽으로든) 끌어 실측 구간(문틀·벽 모서리 사이)에 맞추고, 선분을 잡아 끌면 길이 그대로 옮겨집니다. 그 길이의 실측값(mm)을 넣습니다.</p>
        </section>
        <section>
          <h3>축 선 <span class="legend" style:color={pairColor('x')}>■</span> 첫 쌍 <span class="legend" style:color={pairColor('y')}>■</span> 둘째 쌍 <span class="legend" style:color={pairColor('z')}>■</span> 셋째 쌍 — 색은 축(X 빨강·Y 초록·Z 파랑)을 따릅니다</h3>
          <div class="row">
            <label class="opt"><span class="legend" style:color={pairColor('x')}>■</span> 첫 쌍
              <select data-testid="camera-axis-1" value={draft.axes?.first ?? 'auto'} disabled={ro} onchange={(e) => setAxis('first', e.currentTarget.value)}>
                <option value="auto">자동 (+X 가로)</option>{#each DIRS as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
              </select>
            </label>
            <label class="opt"><span class="legend" style:color={pairColor('y')}>■</span> 둘째 쌍
              <select data-testid="camera-axis-2" value={draft.axes?.second ?? 'auto'} disabled={ro} onchange={(e) => setAxis('second', e.currentTarget.value)}>
                <option value="auto">자동 (+Z 높이)</option>{#each DIRS as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
              </select>
            </label>
          </div>
          <p class="hint">축은 가로 X · 세로 Y(깊이, 벽 안쪽으로) · 높이 Z(위). 선 쌍이 어느 축인지 정하고 방향을 뒤집습니다(리버스). 두 쌍이 이루는 평면이 벽면입니다 (정면 벽 = 가로 X + 높이 Z, 옆면 벽 = 세로 Y + 높이 Z). <b>문틀·창틀처럼 위아래로 뻗는 선은 높이 Z</b> 입니다 — 세로 Y 로 두면 벽면이 바닥이 됩니다. 남은 축은 오른손 규칙으로 자동. 벽의 바깥이 카메라 반대면 경고합니다.</p>
          <label class="check"><input type="checkbox" data-testid="camera-z" checked={!!draft.z} disabled={ro} onchange={toggleZ} /> 셋째 쌍({AXIS_NAME[remaining]}) 선 2개 추가 — 주점 계산용</label>
          <label class="check"><input type="checkbox" data-testid="camera-principal" checked={draft.principal === 'third'} disabled={ro || !draft.z} onchange={(e) => set({ principal: e.currentTarget.checked ? 'third' : 'center' })} /> 세 소실점으로 주점 계산 (잘라낸 사진)</label>
          <p class="hint">흰 십자 = 원점(벽 좌표 0,0). 보통 벽의 왼쪽 아래 모서리.</p>
        </section>
        <section data-testid="camera-result">
          <h3>3D 확인</h3>
          <label class="check"><input type="checkbox" data-testid="camera-show3d" bind:checked={show3d} /> 3D 격자·축 보기</label>
          <p class="hint">풀린 카메라로 벽면 1m 격자와 원점 축(가로 X 빨강 · 세로 Y 초록 · 높이 Z 파랑), 1m 상자를 사진에 겹칩니다. 격자가 벽의 줄눈·창과 나란하고 상자가 서 있으면 맞은 것입니다. 선을 끌면 바로 바뀝니다.</p>
          <h3>결과</h3>
          {#if sol}
            <small data-testid="camera-fov">화각 가로 {sol.fov.h.toFixed(1)}° · 세로 {sol.fov.v.toFixed(1)}° · 초점거리 {fmt(sol.f)}px · 주점 ({fmt(sol.pp[0])}, {fmt(sol.pp[1])})</small>
            <small data-testid="camera-position">카메라 위치 (원점 기준): 벽에서 {m(sol.cameraPos[2])}m 앞 · 높이 {m(sol.cameraPos[1])}m · 좌우 {sol.cameraPos[0] >= 0 ? '오른쪽' : '왼쪽'} {m(Math.abs(sol.cameraPos[0]))}m</small>
            <p class="hint">원점(흰 십자)을 끌면 위치가 바로 바뀝니다. 기준 길이가 축척이므로 거리·높이도 그에 따릅니다.</p>
            {#each sol.warnings as w, i (i)}<p class="warn" data-testid="camera-warning">⚠ {w}</p>{/each}
          {:else}
            <p class="warn">카메라를 풀 수 없습니다. 선·원점을 확인하세요.</p>
          {/if}
        </section>
        {#if !ro}
          <div class="actions">
            <button class="btn small primary" data-testid="camera-apply" disabled={!sol} onclick={() => app.applyCamera()}>적용</button>
            <button class="btn small" onclick={close}>취소</button>
            {#if photo.camera}<button class="btn small danger" data-testid="camera-clear" onclick={() => app.clearCamera(photo.id)}>설정 지우기</button>{/if}
          </div>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(1320px, calc(100vw - 32px)); height: min(880px, calc(100dvh - 48px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 15px; }
  header small { flex: 1; color: var(--muted); font-size: 12px; }
  .body { flex: 1; display: grid; grid-template-columns: 1fr 300px; min-height: 0; }
  .view { position: relative; display: grid; place-items: center; background: #0a0c10; overflow: hidden; }
  .stage { position: relative; }
  .stage img { position: absolute; inset: 0; width: 100%; height: 100%; user-select: none; }
  .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .reflabel { fill: #ff8ae6; }
  .refglow { stroke: rgba(255, 77, 210, 0.5); }
  .refhit { stroke: transparent; cursor: move; }
  .axlabel { font-weight: 700; }
  .handle { fill: #fff; cursor: grab; }
  .handle.ref { stroke: #ff4dd2; } .handle.origin { stroke: #fff; fill: rgba(255,255,255,0.15); }
  .handle.on { fill: var(--accent); cursor: grabbing; }
  .origin line { stroke: #fff; }
  .overlay .g { stroke: rgba(255,255,255,0.45); }
  .overlay .cube { stroke: rgba(255,255,255,0.9); }
  .opt { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); flex: 1; }
  text { fill: #fff; stroke: rgba(0,0,0,0.75); paint-order: stroke; font-weight: 700; pointer-events: none; }
  .loupe { position: absolute; width: 180px; height: 180px; border: 2px solid var(--accent); border-radius: 50%; background: #000; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,0.5); }
  .status { color: var(--muted); }
  aside { border-left: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { margin: 0; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .legend { font-size: 12px; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .row input[type='number'] { width: 90px; }
  .check { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .hint { color: var(--muted); font-size: 11px; margin: 0; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  small { color: var(--muted); font-size: 11px; }
  .actions { display: flex; gap: 6px; margin-top: auto; }
  .axes { width: auto; padding: 4px 6px; font-size: 12px; }
  @media (max-width: 720px) {
    .backdrop { place-items: stretch; }
    .dialog { width: 100vw; height: 100%; border-radius: 0; border: 0; }
    header { gap: 8px; padding: 8px 10px; }
    h2 { font-size: 14px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    header small { display: none; }
    .body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 45%); }
    aside { border-left: 0; border-top: 1px solid var(--line); padding: 10px 12px; }
  }
</style>
