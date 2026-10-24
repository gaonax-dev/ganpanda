<!--
  공용 무한 캔버스 — 화면 조작은 xlpop 캔버스와 같다 (docs/features/shortcuts.md)
  · 마우스 휠, Ctrl+휠, 핀치 → 커서 기준 확대·축소 / 트랙패드 스크롤 → 이동
  · 터치: 두 손가락 → 이동이 먼저(가운데 점을 따라), 간격이 8% 넘게 바뀌면 확대·축소도 (2026-10-20). 두 번째 손가락이 닿으면 첫 손가락 편집은 취소. 한 손가락 빈 곳 드래그 → 이동
  · 단축키(설정에서 변경 가능): ⌘/Ctrl + = - 0, 스페이스+드래그
  · 가운데 버튼 드래그, 빈 곳 드래그 → 이동
-->
<script lang="ts">
  import { isPanThrough } from './panThrough';
  import type { Snippet } from 'svelte';
  import { pan, startTwoFinger, toWorld, twoFinger, zoomAt, type TwoFingerState, type Viewport, type XY } from '../core/viewport';
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
  /** 화면에 닿아 있는 손가락 (pointerId → 캔버스 기준 좌표). 둘이면 핀치 */
  const touches = new Map<number, XY>();
  let pinching = $state(false);
  export function isPinching() { return pinching; }

  function local(e: PointerEvent): XY {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  /** 두 손가락 상태: 처음 간격·확대 켜짐 (core/viewport.ts twoFinger — 이동이 먼저, 그다음 확대) */
  let tf: TwoFingerState | null = null;
  /** 첫 손가락이 누른 요소 — 두 번째 손가락이 닿으면 그 요소의 진행 중인 편집(사인물 끌기·손잡이·그리기)을 취소한다 */
  let firstTarget: EventTarget | null = null;
  let cancelling = false;
  /**
   * 캡처 단계에서 손가락을 추적한다. 두 번째 손가락이 닿으면 두 손가락 화면 조작으로 전환하고 자식(사진·도형)에는 이벤트를 주지 않는다.
   * 두 손가락 끌기(이동)가 모든 제스처보다 먼저 (2026-10-20 사용자: "두손가락 드래그(화면팬)는 모든 제스처중 가장 우선한다. 그 다음 줌이다") —
   * 첫 손가락으로 시작한 편집은 pointercancel 을 보내 되돌린다
   */
  function touchDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, local(e));
    if (touches.size === 1) firstTarget = e.target;
    if (touches.size === 2) {
      pinching = true; drag = null; e.stopPropagation(); e.preventDefault();
      const [a, b] = [...touches.values()];
      tf = startTwoFinger([a, b]);
      const firstId = [...touches.keys()][0];
      if (firstTarget) {
        cancelling = true;
        try { firstTarget.dispatchEvent(new PointerEvent('pointercancel', { pointerId: firstId, pointerType: 'touch', isPrimary: true, bubbles: true, composed: true })); } finally { cancelling = false; }
      }
    }
    else if (touches.size > 2) e.stopPropagation();
  }
  function touchMove(e: PointerEvent) {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    if (!pinching) { touches.set(e.pointerId, local(e)); return; }
    e.stopPropagation(); e.preventDefault();
    const ids = [...touches.keys()];
    if (ids.length < 2 || !ids.includes(e.pointerId)) return;
    const [a, b] = ids;
    const prev: [XY, XY] = [touches.get(a)!, touches.get(b)!];
    touches.set(e.pointerId, local(e));
    const now: [XY, XY] = [touches.get(a)!, touches.get(b)!];
    const r = twoFinger(viewport, tf ?? startTwoFinger(prev), prev, now);
    viewport = r.v; tf = r.st;
  }
  function touchUp(e: PointerEvent) {
    if (e.pointerType !== 'touch' || cancelling) return; // 첫 손가락 편집 취소용으로 보낸 pointercancel 은 손가락을 떼는 것이 아니다
    touches.delete(e.pointerId);
    if (pinching) { e.stopPropagation(); if (touches.size < 2) { pinching = false; touches.clear(); tf = null; firstTarget = null; } }
    else if (!touches.size) firstTarget = null;
  }
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
    const forcePan = e.button === 1 || (e.button === 0 && panKey !== null) || (e.button === 0 && isPanThrough(e)); // 사인물·카드·존 위 한 손가락 = 팬 (2026-10-24)
    if (!forcePan) {
      if (!bg || e.button !== 0) return;
      if (onbackgrounddown?.(e, clientToWorld(e.clientX, e.clientY))) return;
    }
    e.preventDefault();
    e.stopPropagation();
    drag = { x: e.clientX, y: e.clientY };
    try { el.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
  }
  function move(e: PointerEvent) {
    if (!drag || pinching) return;
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
  /** 터치 기기: 길게 누르기의 브라우저 메뉴(이미지 저장·공유·텍스트 선택)를 막는다 — 보드에서는 길게 누르기도 조작 (2026-10-24 "사진을 길게 누르면 나오는 외부 작동이 있다. 제거해줘"). 데스크톱 오른쪽 클릭은 그대로 */
  const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
</script>

<div
  class="ic"
  class:panning={panKey !== null || drag !== null || pinching}
  class:pinching
  bind:this={el}
  data-testid={testid}
  oncontextmenu={(e) => { if (COARSE) e.preventDefault(); }}
  role="application"
  style:cursor={drag ? 'grabbing' : panKey ? 'grab' : cursor}
  style:background-size="{gridStep}px {gridStep}px"
  style:background-position="{viewport.x}px {viewport.y}px"
  onpointerdowncapture={(e) => { touchDown(e); if (pinching) return; if (e.button === 1 || (e.button === 0 && panKey)) down(e); }}
  onpointermovecapture={touchMove}
  onpointerupcapture={touchUp}
  onpointercancelcapture={touchUp}
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
  /* 두 손가락 조작 중에는 원근(matrix3d)으로 겹친 그림을 잠시 숨긴다 — 3D 층은 확대 배율마다 큰 그림으로 다시 그려져 휴대폰 메모리가 넘쳤다 (2026-10-21 "핀치줌중에 페이지 열수 없음 크레시") */
  .ic.pinching :global(.warp) { display: none; }
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
  /* 아이폰 길게 누르기 메뉴(callout)·선택 끔 — 입력 칸은 그대로 (2026-10-24) */
  @media (pointer: coarse) {
    .ic, .ic :global(*:not(input):not(textarea)) { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
  }
</style>
