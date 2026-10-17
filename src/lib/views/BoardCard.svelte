<!--
  사진 보드 위 평면도 카드: 사진 아래(그 사진의 치수 입력된 사인물) 또는 보드 빈 곳(사진 없는 사인물).
  얼굴은 사진 영역을 정면 보정한 모습(사진이 없으면 색 면), 이름·치수 라벨은 화면 크기 고정
-->
<script lang="ts">
  import type { Photo, SignObject } from '../core/model';
  import { faceBadge, faceClip } from '../core/cardFace';
  import { bodyLook } from '../core/render';
  import { faceUrl } from '../photoDisplay';
  import DesignFace from '../ui/DesignFace.svelte';
  import PartsOverlay from '../ui/PartsOverlay.svelte';

  let { o, x, y, w, h, mmW, mmH, photo, zoom, selected, standalone = false, linked = false, onpointerdown }: {
    o: SignObject; x: number; y: number; w: number; h: number;
    /** 카드가 나타내는 사인물 mm (조합형 객체 배치) */
    mmW: number; mmH: number;
    photo?: Photo; zoom: number; selected: boolean;
    /** 사진 없는(보드에 직접 만든) 사인물 */
    standalone?: boolean;
    /** 사진의 영역과 연결되어 있음 */
    linked?: boolean;
    onpointerdown?: (e: PointerEvent) => void;
  } = $props();
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  // 카드 안에서의 사진 크기: 카드 px 기준으로 사진 원본을 정면 보정하므로 faceWarp 는 mm 가 아니라 카드 px 로
  const inv = $derived(1 / zoom);
  // 얼굴: 사진 영역을 펼친 작은 그림 (원본을 matrix3d 로 겹치면 휴대폰 메모리가 넘친다)
  let face = $state<string | undefined>(undefined);
  // 바탕색(2026-10-17 "정면도에도 배경색 나오게"): 2D 무대의 sign-fill 과 같은 색·투명도를 사진 얼굴 위에
  const look = $derived(bodyLook(o));
  const badge = $derived(faceBadge(o));
  $effect(() => {
    const mm = { w: o.widthMm ?? w, h: o.heightMm ?? h };
    if (photo && o.quad.length === 4) faceUrl(photo.assetId, photo.w, o.quad, mm.w, mm.h).then((u) => (face = u));
    else face = undefined;
  });
</script>

<div class="card" class:standalone class:sel={selected} data-testid={standalone ? 'board-standalone' : 'board-card'} data-id={o.id}
  style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" role="button" tabindex="-1" onpointerdown={onpointerdown}>
  <div class="face" style:clip-path={faceClip(o, w, h)}>
    {#if face}<img class="flat" src={face} alt="" draggable="false" />{/if}
    {#if look}<div class="fill" data-testid="card-fill" style:background={look.color} style:opacity={look.opacity}></div>{/if}
    {#if o.design}<div class="design"><DesignFace design={o.design} {w} {h} /></div>{/if}
    <PartsOverlay {o} {mmW} {mmH} {w} {h} />
  </div>
  <!-- 카드가 화면에서 40px 보다 좁으면(많이 축소) 라벨이 서로 겹치므로 숨긴다 -->
  {#if w * zoom >= 40}
  <div class="label" style:transform="scale({inv})">
    <b><span class="badge {badge.id}" data-testid="card-badge" data-state={badge.id}>{badge.label}</span>{linked ? '⇄ ' : ''}{o.name}</b>
    {#if o.widthMm && o.heightMm}<span>{fmt(o.widthMm)} × {fmt(o.heightMm)}{o.depthMm ? ` × ${fmt(o.depthMm)}` : ''} mm</span>{:else}<span class="muted">치수 입력</span>{/if}
    {#if standalone && !linked}<span class="muted">보드 사인물 — 사진의 영역과 연결하세요</span>{/if}
  </div>
  {/if}
</div>

<style>
  .card { position: absolute; cursor: grab; }
  .face { position: absolute; inset: 0; overflow: hidden; background: #d9d9d4; outline: 1px solid rgba(255, 255, 255, 0.35); }
  .standalone .face { background: #e8e4d8; outline: 1px dashed rgba(255, 204, 0, 0.7); }
  .sel .face { outline: 2px solid var(--accent); }
  .face img.flat { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .fill { position: absolute; inset: 0; pointer-events: none; }
  .design { position: absolute; inset: 0; }
  .badge { display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; font-size: 9px; font-weight: 600; line-height: 14px; vertical-align: 1px; color: var(--muted); border: 1px solid var(--line); }
  .badge.settings { color: var(--accent); border-color: rgba(255, 204, 0, 0.5); }
  .badge.design { color: #1a1500; background: var(--accent); border-color: var(--accent); }
  .label { position: absolute; left: 0; top: 100%; margin-top: 4px; transform-origin: 0 0; display: flex; flex-direction: column; gap: 1px; font-size: 11px; color: var(--text); white-space: nowrap; pointer-events: none; }
  .label b { font-size: 12px; }
  .muted { color: var(--muted); }
</style>
