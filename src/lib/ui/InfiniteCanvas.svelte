<!--
  공용 무한 캔버스 — 화면 조작은 xlpop 캔버스와 같다 (docs/features/shortcuts.md)
  · 마우스 휠, Ctrl+휠, 핀치 → 커서 기준 확대·축소 / 트랙패드 스크롤 → 이동
  · 단축키(설정에서 변경 가능): ⌘/Ctrl + = - 0, 스페이스+드래그
  · 가운데 버튼 드래그, 빈 곳 드래그 → 이동
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { pan, toWorld, zoomAt, type Viewport, type XY } from '../core/viewport';
  import { wheelIntent, isWindowsPlatform } from '../core/wheel';
  import { matchAction } from '../core/keymap';
  import { app } from '../state.svelte';

  /** 키보드 확대·축소 한 번의 배율 (xlpop STEP) */
  const KEY_ZOOM_STEP = 1.25;

  let {
    viewport = $bindable(),
    children,
    overlay,
    onbackgrounddown,
    onfit,
    zoomAnchor,
    cursor = 'default',
    testid = 'canvas',
  }: {
    viewport: Viewport;
    children: Snippet;
    overlay?: Snippet;
    /** 빈 곳을 눌렀을 때. true 를 반환하면 이동(pan)을 시작하지 않는다 */
    onbackgrounddown?: (e: PointerEvent, world: XY) => boolean | void;
    /** 전체 보기 단축키 */
    onfit?: () => void;
    /** 키보드 확대 기준점(캔버스 기준 화면 좌표). 없거나 화면 밖이면 화면 중심 */
    zoomAnchor?: () => XY | null;
    cursor?: string;
    testid?: string;
  } = $props();

  let el: HTMLDivElement;
  /** 이동 키(기본 스페이스)를 누르고 있는 물리 키 */
  let panKey: string | null = $state(null);
  let hovered = false;
  let drag: { x: number; y: number } | null = $state(null);
  const isWindows = isWindowsPlatform();

  export function clientToWorld(cx: number, cy: number): XY {
    const r = el.getBoundingClientRect();
    return toWorld(viewport, { x: cx - r.left, y: cy - r.top });
  }
  export function size() {
    return { w: el.clientWidth, h: el.clientHeight };
  }

  function isTyping(e: Event) {
    const t = e.target as HTMLElement;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  }

  function keyZoom(factor: number) {
    const a = zoomAnchor?.();
    const inside = a && a.x >= 0 && a.y >= 0 && a.x <= el.clientWidth && a.y <= el.clientHeight;
    viewport = zoomAt(viewport, inside ? a : { x: el.clientWidth / 2, y: el.clientHeight / 2 }, factor);
  }

  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const it = wheelIntent(e as WheelEvent & { wheelDeltaY?: number }, isWindows);
      if (it.kind === 'zoom') viewport = zoomAt(viewport, { x: e.clientX - r.left, y: e.clientY - r.top }, it.factor);
      else viewport = pan(viewport, it.dx, it.dy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    const kd = (e: KeyboardEvent) => {
      if (app.settingsOpen || !el.offsetParent) return; // 설정 중이거나 숨겨진 화면
      if (isTyping(e)) return;
      const action = matchAction(app.keymap, e, app.isMac);
      if (action === 'panHold') {
        if (!hovered) return;
        e.preventDefault();
        panKey = e.code;
        return;
      }
      if (action !== 'zoomIn' && action !== 'zoomOut' && action !== 'zoomFit') return;
      e.preventDefault(); // 브라우저 확대·축소 막기
      if (!hovered) return;
      if (action === 'zoomIn') keyZoom(KEY_ZOOM_STEP);
      else if (action === 'zoomOut') keyZoom(1 / KEY_ZOOM_STEP);
      else onfit?.();
    };
    const ku = (e: KeyboardEvent) => { if (e.code === panKey) panKey = null; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  });

  function down(e: PointerEvent) {
    const bg = e.target === el || (e.target as HTMLElement).dataset.bg !== undefined;
    const forcePan = e.button === 1 || (e.button === 0 && panKey !== null);
    if (!forcePan) {
      if (!bg || e.button !== 0) return;
      if (onbackgrounddown?.(e, clientToWorld(e.clientX, e.clientY))) return;
    }
    e.preventDefault();
    e.stopPropagation();
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
  class:panning={panKey !== null || drag !== null}
  bind:this={el}
  data-testid={testid}
  role="application"
  style:cursor={drag ? 'grabbing' : panKey ? 'grab' : cursor}
  style:background-size="{gridStep}px {gridStep}px"
  style:background-position="{viewport.x}px {viewport.y}px"
  onpointerdowncapture={(e) => { if (e.button === 1 || (e.button === 0 && panKey)) down(e); }}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
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
  /* 이동 중에는 사진·도형이 포인터를 가로채지 않게 */
  .ic.panning :global(*) { pointer-events: none; }
  .world {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }
</style>
