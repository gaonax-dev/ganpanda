<!-- 공용 무한 캔버스: 휠=이동, Ctrl/⌘+휠·핀치=확대, 스페이스/가운데 버튼/빈 곳 드래그=이동 -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { pan, toWorld, zoomAt, type Viewport, type XY } from '../core/viewport';

  let {
    viewport = $bindable(),
    children,
    overlay,
    onbackgrounddown,
    cursor = 'default',
    testid = 'canvas',
  }: {
    viewport: Viewport;
    children: Snippet;
    overlay?: Snippet;
    /** 빈 곳을 눌렀을 때. true 를 반환하면 이동(pan)을 시작하지 않는다 */
    onbackgrounddown?: (e: PointerEvent, world: XY) => boolean | void;
    cursor?: string;
    testid?: string;
  } = $props();

  let el: HTMLDivElement;
  let space = $state(false);
  let drag: { x: number; y: number } | null = $state(null);

  export function clientToWorld(cx: number, cy: number): XY {
    const r = el.getBoundingClientRect();
    return toWorld(viewport, { x: cx - r.left, y: cy - r.top });
  }
  export function size() {
    return { w: el.clientWidth, h: el.clientHeight };
  }

  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) viewport = zoomAt(viewport, p, Math.exp(-e.deltaY * 0.01));
      else viewport = pan(viewport, -e.deltaX, -e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTyping(e)) { space = true; e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  });

  function isTyping(e: Event) {
    const t = e.target as HTMLElement;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }

  function down(e: PointerEvent) {
    const bg = e.target === el || (e.target as HTMLElement).dataset.bg !== undefined;
    const forcePan = e.button === 1 || space;
    if (!forcePan) {
      if (!bg || e.button !== 0) return;
      if (onbackgrounddown?.(e, clientToWorld(e.clientX, e.clientY))) return;
    }
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    viewport = pan(viewport, e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
  }
  function up() {
    drag = null;
  }

  // 확대 배율에 맞춰 점 격자 간격을 12~48px 사이로 유지
  const gridStep = $derived.by(() => {
    let s = 24 * viewport.zoom;
    while (s < 12) s *= 4;
    while (s > 48) s /= 4;
    return s;
  });
</script>

<div
  class="ic"
  bind:this={el}
  data-testid={testid}
  role="application"
  style:cursor={drag ? 'grabbing' : space ? 'grab' : cursor}
  style:background-size="{gridStep}px {gridStep}px"
  style:background-position="{viewport.x}px {viewport.y}px"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
>
  <div class="world" data-bg style:transform="translate({viewport.x}px, {viewport.y}px) scale({viewport.zoom})">
    {@render children()}
  </div>
  {@render overlay?.()}
</div>

<style>
  .ic {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    background-color: var(--canvas);
    background-image: radial-gradient(circle, var(--dot) 1px, transparent 1.2px);
    user-select: none;
  }
  .world {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }
</style>
