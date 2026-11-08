<svelte:options namespace="svg" />
<!--
  닫힌 경로 편집 손잡이 — 다각형 사인물과 앞가림 마스크가 같이 쓴다 (2026-11-08 "존의 작동 원리를 다각형에 적용한다. 존을 폐지하고 존의 작동원리에 베지어곡선 컨트롤러를 추가하고 마스크를 추가한다").
  존에서 옮긴 것: 꼭짓점 끌기 · 변 가운데 □ 누르면 꼭짓점 추가 · 꼭짓점을 골라 Delete(최소 3개, 지우기는 부르는 쪽).
  더한 것: 꼭짓점 두 번 누르기 = 곡선 손잡이 켜기/끄기 ((질문) "꼭짓점 두 번 누르기"), 손잡이 끌기 = 반대쪽 대칭, Alt = 그쪽만. → core/pathEdit.ts
-->
<script lang="ts">
  import type { Pt } from '../core/homography';
  import { insertVertex, midpoints, moveHandle, moveVertex, toggleCurve, type Path } from '../core/pathEdit';

  let { path, u, hit, testid, selVertex = null, toPhoto, onchange, onselect, ondragend }: {
    path: Path;
    /** 화면 1px 의 사진 px */
    u: number;
    /** 터치 영역 반지름 (화면 px) */
    hit: number;
    /** 테스트 이름 앞머리: mask · poly */
    testid: string;
    selVertex?: number | null;
    /** 화면 좌표 → 사진 px (사진 안으로) */
    toPhoto: (cx: number, cy: number) => Pt;
    /** boundary = 실행 취소 한 단계 (끄는 동안은 false — 놓을 때 ondragend) */
    onchange: (p: Path, boundary: boolean) => void;
    onselect: (vertex: number | null) => void;
    ondragend: () => void;
  } = $props();

  let drag: { kind: 'vertex' | 'in' | 'out'; i: number; moved: boolean } | null = null;
  /** 두 번 누르기 (마우스 dblclick 은 터치에서 안 와서 직접 잰다) */
  let lastTap: { i: number; t: number; v: Pt } | null = null;
  const at = (e: PointerEvent): Pt => { const [x, y] = toPhoto(e.clientX, e.clientY); return [Math.round(x), Math.round(y)]; };

  function vertexDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const now = performance.now();
    const v = path.pts[i];
    // 같은 꼭짓점(자리까지 같은 것 — 지우고 번호가 당겨진 다른 점은 아님)을 350ms 안에 다시
    if (lastTap && lastTap.i === i && lastTap.v[0] === v[0] && lastTap.v[1] === v[1] && now - lastTap.t < 350) { lastTap = null; onchange(toggleCurve(path, i), true); onselect(i); return; }
    lastTap = { i, t: now, v };
    onselect(i);
    drag = { kind: 'vertex', i, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function handleDown(e: PointerEvent, i: number, which: 'in' | 'out') {
    if (e.button !== 0) return;
    e.stopPropagation();
    lastTap = null;
    drag = { kind: which, i, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    e.stopPropagation();
    drag.moved = true;
    lastTap = null;
    const p = at(e);
    onchange(drag.kind === 'vertex' ? moveVertex(path, drag.i, p) : moveHandle(path, drag.i, drag.kind, p, e.altKey), false);
  }
  function up() { if (drag?.moved) ondragend(); drag = null; }
  function midDown(e: PointerEvent, edge: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    lastTap = null;
    onchange(insertVertex(path, edge), true);
    onselect(edge + 1);
  }
</script>

<g class="path-edit" data-testid="{testid}-edit">
  {#each midpoints(path) as m, i (i)}
    <rect data-testid="{testid}-mid" class="mid" x={m[0] - 4 * u} y={m[1] - 4 * u} width={8 * u} height={8 * u} stroke-width={1.5 * u} role="button" tabindex="-1" onpointerdown={(e) => midDown(e, i)}><title>꼭짓점 추가</title></rect>
  {/each}
  {#each path.pts as v, i (i)}
    {@const c = path.curves?.[i]}
    {#if c}
      <line class="arm" x1={c.in[0]} y1={c.in[1]} x2={v[0]} y2={v[1]} stroke-width={1.2 * u} />
      <line class="arm" x1={v[0]} y1={v[1]} x2={c.out[0]} y2={c.out[1]} stroke-width={1.2 * u} />
      {#each ['in', 'out'] as const as w (w)}
        <circle class="hit" cx={c[w][0]} cy={c[w][1]} r={hit * 0.8 * u} role="button" tabindex="-1" onpointerdown={(e) => handleDown(e, i, w)} onpointermove={move} onpointerup={up} />
        <circle data-testid="{testid}-handle-{w}" data-index={i} class="ctl" cx={c[w][0]} cy={c[w][1]} r={4 * u} stroke-width={1.5 * u} role="button" tabindex="-1" onpointerdown={(e) => handleDown(e, i, w)} onpointermove={move} onpointerup={up}><title>곡선 손잡이 — 끌면 반대쪽은 대칭, Alt 를 누르면 이쪽만</title></circle>
      {/each}
    {/if}
  {/each}
  {#each path.pts as v, i (i)}
    <circle class="hit" data-testid="{testid}-vertex-hit" cx={v[0]} cy={v[1]} r={hit * u} role="button" tabindex="-1" onpointerdown={(e) => vertexDown(e, i)} onpointermove={move} onpointerup={up} />
    <circle data-testid="{testid}-vertex" data-index={i} data-curve={path.curves?.[i] ? '1' : undefined} class="vertex" class:sel={selVertex === i} class:curve={!!path.curves?.[i]} cx={v[0]} cy={v[1]} r={6 * u} stroke-width={2 * u} role="button" tabindex="-1"
      onpointerdown={(e) => vertexDown(e, i)} onpointermove={move} onpointerup={up}><title>꼭짓점 — 끌어 옮기기, 두 번 누르면 곡선/직선, 고른 뒤 Delete 로 지우기</title></circle>
  {/each}
</g>

<style>
  .mid { fill: #fff; stroke: var(--accent); cursor: copy; }
  .arm { stroke: var(--accent); opacity: 0.8; pointer-events: none; }
  .ctl { fill: var(--accent); stroke: #fff; cursor: grab; }
  .vertex { fill: #fff; stroke: var(--accent); cursor: grab; }
  .vertex.curve { fill: color-mix(in srgb, var(--accent) 35%, #fff); }
  .vertex.sel { fill: var(--accent); }
  .hit { fill: transparent; stroke: none; cursor: grab; }
</style>
