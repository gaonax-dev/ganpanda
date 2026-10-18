<!--
  말풍선 (SVG 안에서 쓰는 조각, 2026-10-18): 몸통(둥근 상자, 안에 마지막 상태 요약·번호·안 읽은 수) + 꼭지(지점으로 뻗는 꼬리).
  · 몸통 안쪽을 끌면 전체 이동(onwhole) · 몸통 변(테두리)을 끌면 몸통만(onbody, 꼭지는 그 자리) · 꼭지 끝 손잡이를 끌면 꼭지만(ontip)
  · 끌지 않고 떼면 onclick. 좌표는 이 SVG 의 사용자 좌표(getScreenCTM 으로 환산), u = 화면 1px 당 사용자 좌표
-->
<svelte:options namespace="svg" />
<script lang="ts">
  import type { Pt } from '../core/homography';
  import { bubbleLayout, bubblePath } from '../core/bubbleShape';

  let { tip, body, label, number = '', badge = 0, color, u = 1, selected = false, resolved = false, editable = true, testid = 'bubble', attrs = {}, title = '',
    onwhole, onbody, ontip, ondragend, onclick }: {
    tip: Pt; body: Pt; label: string; /** 몸통 앞의 번호 표시 (#1, →) */ number?: string; /** 안 읽은 수 */ badge?: number;
    color: string; u?: number; selected?: boolean; resolved?: boolean; editable?: boolean; testid?: string; attrs?: Record<string, string | undefined>; title?: string;
    onwhole?: (dx: number, dy: number) => void; onbody?: (dx: number, dy: number) => void; ontip?: (dx: number, dy: number) => void; ondragend?: () => void; onclick?: () => void;
  } = $props();

  const fs = $derived(11 * u);
  const text = $derived([number, label].filter(Boolean).join(' '));
  // 3:2 몸통, 최대 3줄, 넘치면 … (2026-10-18)
  const lay = $derived(bubbleLayout(text, fs));
  const geom = $derived({ cx: body[0], cy: body[1], w: lay.w, h: lay.h });
  const lineH = $derived(fs * 1.25);
  /** 몸통 + 꼬리 한 획 (아웃라인이 이어진다) */
  const d = $derived(bubblePath(geom, tip, 7 * u, 7 * u));
  const stroke = $derived(1.5 * u);

  let drag: { kind: 'whole' | 'body' | 'tip'; last: Pt; moved: boolean; start: [number, number] } | null = null;
  function local(e: PointerEvent): Pt {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  }
  function down(e: PointerEvent, kind: 'whole' | 'body' | 'tip') {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag = { kind, last: local(e), moved: false, start: [e.clientX, e.clientY] };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || !editable) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 3) return;
    drag.moved = true;
    const p = local(e);
    const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    drag.last = p;
    (drag.kind === 'whole' ? onwhole : drag.kind === 'body' ? onbody : ontip)?.(dx, dy);
  }
  function up() {
    if (!drag) return;
    const was = drag; drag = null;
    if (was.moved) ondragend?.(); else onclick?.();
  }
</script>

<g class="bubble" class:sel={selected} class:resolved data-testid={testid} {...attrs} role="button" tabindex="-1" style:--c={color}>
  {#if title}<title>{title}</title>{/if}
  <!-- 몸통 + 꼬리를 한 획으로 그려 아웃라인이 이어진다 (2026-10-18). 변을 끌면 몸통만 -->
  <path class="body" {d} fill={color} stroke="#fff" stroke-width={stroke} stroke-linejoin="round" />
  <path class="edge" role="button" tabindex="-1" data-testid="{testid}-edge" {d} fill="none" stroke="transparent" stroke-width={10 * u} pointer-events="stroke"
    onpointerdown={(e) => down(e, 'body')} onpointermove={move} onpointerup={up} onpointercancel={up}><title>테두리를 끌면 풍선만 옮기기 (꼭지는 그대로)</title></path>
  <!-- 안쪽: 끌면 전체 이동, 누르면 열기 -->
  <rect class="inner" role="button" tabindex="-1" data-testid="{testid}-inner" x={geom.cx - geom.w / 2 + 5 * u} y={geom.cy - geom.h / 2 + 5 * u} width={Math.max(1, geom.w - 10 * u)} height={Math.max(1, geom.h - 10 * u)} fill="transparent"
    onpointerdown={(e) => down(e, 'whole')} onpointermove={move} onpointerup={up} onpointercancel={up} />
  <!-- 글: 여러 줄, 가운데 정렬 -->
  <text class="label" data-testid="{testid}-last" x={geom.cx} y={geom.cy - ((lay.lines.length - 1) * lineH) / 2} font-size={fs} text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" pointer-events="none">{#each lay.lines as line, i (i)}<tspan x={geom.cx} dy={i ? lineH : 0}>{line}{i < lay.lines.length - 1 ? ' ' : ''}</tspan>{/each}</text>
  {#if badge}
    <g transform="translate({geom.cx + geom.w / 2 - 2 * u} {geom.cy - geom.h / 2 + 2 * u})" pointer-events="none">
      <circle r={7 * u} fill="var(--accent)" />
      <text data-testid="{testid}-unread" font-size={9 * u} text-anchor="middle" dy={3 * u} fill="#1a1500" font-weight="800">{badge}</text>
    </g>
  {/if}
  <!-- 꼭지 손잡이: 보이지 않는 터치 영역만 (점은 없앰, 2026-10-18). 끌면 꼭지만 -->
  {#if editable}
    <circle class="tiph" role="button" tabindex="-1" data-testid="{testid}-tip" cx={tip[0]} cy={tip[1]} r={9 * u} fill="transparent" stroke="none"
      onpointerdown={(e) => down(e, 'tip')} onpointermove={move} onpointerup={up} onpointercancel={up}><title>꼭지 옮기기</title></circle>
  {/if}
</g>

<style>
  .bubble { cursor: pointer; }
  .bubble.resolved { opacity: 0.45; }
  .bubble.sel .body { stroke: var(--accent); }
  .edge { cursor: move; }
  .tiph { cursor: crosshair; }
  .label { user-select: none; }
</style>
