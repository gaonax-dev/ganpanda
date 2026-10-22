<!--
  말풍선 = 번호 원 (2026-10-22 사용자: "말풍선 제거한다. 말풍선 숫자만 사용한다"). 지점(tip)에 번호(지점 말풍선은 #번호, 사인물은 대화 수)만.
  · 끌면 지점이 옮겨진다(onwhole) · 끌지 않고 떼면 onclick. 안 읽은 게 있으면 테두리 강조 + 작은 수
  · 좌표는 이 SVG 의 사용자 좌표(getScreenCTM 으로 환산), u = 화면 1px 당 사용자 좌표
-->
<svelte:options namespace="svg" />
<script lang="ts">
  import type { Pt } from '../core/homography';

  let { tip, num, arrow = false, badge = 0, color, u = 1, selected = false, resolved = false, editable = true, testid = 'bubble', attrs = {}, title = '',
    onwhole, ondragend, onclick }: {
    tip: Pt; /** 원 안의 숫자 */ num: string; /** 받는 사람이 정해진 지점 말풍선 (→) */ arrow?: boolean; /** 안 읽은 수 */ badge?: number;
    color: string; u?: number; selected?: boolean; resolved?: boolean; editable?: boolean; testid?: string; attrs?: Record<string, string | undefined>; title?: string;
    onwhole?: (dx: number, dy: number) => void; ondragend?: () => void; onclick?: () => void;
  } = $props();

  const r = $derived(11 * u);

  let drag: { last: Pt; moved: boolean; start: [number, number] } | null = null;
  function local(e: PointerEvent): Pt {
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag = { last: local(e), moved: false, start: [e.clientX, e.clientY] };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || !editable) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 3) return;
    drag.moved = true;
    const p = local(e);
    const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    drag.last = p;
    onwhole?.(dx, dy);
  }
  function up() {
    if (!drag) return;
    const was = drag; drag = null;
    if (was.moved) ondragend?.(); else onclick?.();
  }
</script>

<g class="bubble" class:sel={selected} class:resolved class:unread={badge > 0} data-testid={testid} {...attrs} role="button" tabindex="-1" style:--c={color}>
  {#if title}<title>{title}</title>{/if}
  <circle class="dot" cx={tip[0]} cy={tip[1]} r={r} fill={color} stroke={badge > 0 ? 'var(--accent)' : '#fff'} stroke-width={(badge > 0 ? 3 : 1.5) * u} />
  <text data-testid="{testid}-num" x={tip[0]} y={tip[1]} font-size={11 * u} text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="800" pointer-events="none">{num}</text>
  {#if arrow}<text x={tip[0] + r + 2 * u} y={tip[1]} font-size={10 * u} dominant-baseline="central" fill={color} font-weight="800" pointer-events="none">→</text>{/if}
  {#if badge}
    <g transform="translate({tip[0] + r * 0.8} {tip[1] - r * 0.8})" pointer-events="none">
      <circle r={6.5 * u} fill="#ef4444" />
      <text data-testid="{testid}-unread" font-size={8.5 * u} text-anchor="middle" dy={3 * u} fill="#fff" font-weight="800">{badge}</text>
    </g>
  {/if}
  <!-- 누르기·끌기 영역 (손가락 크기) -->
  <circle class="hit" role="button" tabindex="-1" data-testid="{testid}-inner" cx={tip[0]} cy={tip[1]} r={Math.max(r, 14 * u)} fill="transparent"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} />
</g>

<style>
  .bubble { cursor: pointer; }
  .bubble.resolved { opacity: 0.45; }
  .bubble.sel .dot { stroke: var(--accent); }
  .hit { cursor: move; }
</style>
