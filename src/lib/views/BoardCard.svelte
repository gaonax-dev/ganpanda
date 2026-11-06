<!--
  사진 보드 위 평면도 카드: 사진 아래(그 사진의 치수 입력된 사인물) 또는 보드 빈 곳(사진 없는 사인물).
  얼굴은 사진 영역을 정면 보정한 모습(사진이 없으면 색 면), 이름·치수 라벨은 화면 크기 고정
-->
<script lang="ts">
  import { SYNC_STATUS_LABEL, type SyncStatus } from '../core/designSync';
  import { cardLayers } from '../core/cardLayers';
  import type { Photo, SignObject } from '../core/model';
  import { faceBadge, faceClip } from '../core/cardFace';
  import { bodyLook } from '../core/render';
  import { app } from '../state.svelte';
  import { lastStateOf } from '../core/bubbles';
  import { DEFAULT_TIP } from '../core/bubbleShape';
  import { colorFor } from '../core/presence';
  import BubbleShape from '../ui/BubbleShape.svelte';
  import type { Pt } from '../core/homography';
  import { faceUrl } from '../photoDisplay';
  import DesignFace from '../ui/DesignFace.svelte';
  import PartsOverlay from '../ui/PartsOverlay.svelte';

  let { o, x, y, w, h, mmW, mmH, photo, zoom, selected, multi = false, standalone = false, linked = false, placeholder = false, nophoto = false, changed = false, sync, onpointerdown }: {
    o: SignObject; x: number; y: number; w: number; h: number;
    /** 카드가 나타내는 사인물 mm (조합형 객체 배치) */
    mmW: number; mmH: number;
    /** 치수 없는 사인물의 임시 카드 (2026-10-22) */
    placeholder?: boolean;
    photo?: Photo; zoom: number; selected: boolean;
    /** 다중 선택에 들어 있음(주 선택 아님) */
    multi?: boolean;
    /** 사진 없는(보드에 직접 만든) 사인물 */
    standalone?: boolean;
    /** 사진의 영역과 연결되어 있음 */
    linked?: boolean;
    /** 사진에 없음 — 어느 사진에도 외곽선이 없다 → 외곽 빨강 (2026-11-05) */
    nophoto?: boolean;
    /** 고객 컨펌(계약·발행) 뒤 바뀐 사인물 — 변경안 (2026-11-05) */
    changed?: boolean;
    /** 디자인 싱크 받기 검토 중 상태 (2026-11-06) */
    sync?: SyncStatus;
    onpointerdown?: (e: PointerEvent) => void;
  } = $props();
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  // 카드 안에서의 사진 크기: 카드 px 기준으로 사진 원본을 정면 보정하므로 faceWarp 는 mm 가 아니라 카드 px 로
  const inv = $derived(1 / zoom);
  // 얼굴: 사진 영역을 펼친 작은 그림 (원본을 matrix3d 로 겹치면 휴대폰 메모리가 넘친다)
  let face = $state<string | undefined>(undefined);
  // 바탕색(2026-10-17 "정면도에도 배경색 나오게"): 2D 무대의 sign-fill 과 같은 색·투명도를 사진 얼굴 위에
  // 실측 탭은 원본 사진만 (2026-11-05 "실측모드에서 사인물카드 재질이 아닌 원본 사진표시") — 재질·디자인·구성 요소는 2D·디자인 탭
  // 탭마다 그리는 층 (2026-11-06 "사인물카드는 실측(사진), 2d(속성내용), 3d(속성내용 3d추가), 디자인(대지 이미지)") — core/cardLayers
  const layers = $derived(cardLayers(app.tab, !!o.design));
  const look = $derived(layers.fill ? bodyLook(o) : null);
  const badge = $derived(faceBadge(o));
  // 정면도 카드의 말풍선 (2026-10-18 "사진에 갇혀 있는데 정면도들에게도 적용"): 사인물 좌표(0~1)로 저장된 자리를 카드 px 로
  const chatId = $derived(o.sameAs ?? o.id);
  const lastMsg = $derived(lastStateOf(app.messages, chatId));
  const tipC = $derived(((o.bubble?.tip ?? DEFAULT_TIP).map((v, i) => v * (i ? h : w))) as Pt);
  const bodyC = $derived((o.bubble?.body ? o.bubble.body.map((v, i) => v * (i ? h : w)) : [tipC[0] + 56 * inv, tipC[1] - 48 * inv]) as Pt);
  const saveBubble = (tp: Pt, bp: Pt) => app.project.updateObject(o.id, { bubble: { tip: [tp[0] / w, tp[1] / h].map((v) => Math.round(v * 1e4) / 1e4) as [number, number], body: [bp[0] / w, bp[1] / h].map((v) => Math.round(v * 1e4) / 1e4) as [number, number] } });
  $effect(() => {
    const mm = { w: o.widthMm ?? w, h: o.heightMm ?? h };
    if (photo && o.quad.length === 4 && !app.safeMode) faceUrl(photo.assetId, photo.w, o.quad, mm.w, mm.h).then((u) => (face = u));
    else face = undefined;
  });
</script>

<div class="card" class:standalone class:nophoto class:sel={selected} data-sync={sync} class:multi data-multi={multi || undefined} data-nophoto={nophoto ? '1' : undefined} title={nophoto ? '사진에 없는 사인물 — 사진 위에 외곽선이 없습니다' : undefined} data-testid={standalone ? 'board-standalone' : 'board-card'} data-id={o.id}
  style:--z={zoom} style:left="{x}px" style:top="{y}px" style:width="{w}px" style:height="{h}px" role="button" tabindex="-1" onpointerdown={onpointerdown}>
  <div class="face" style:clip-path={faceClip(o, w, h)}>
    {#if face}<img class="flat" src={face} alt="" draggable="false" />{/if}
    {#if look}<div class="fill" data-testid="card-fill" style:background={look.color} style:opacity={look.opacity}></div>{/if}
    {#if layers.design && o.design}<div class="design"><DesignFace design={o.design} {w} {h} /></div>{/if}
    {#if layers.parts}<PartsOverlay {o} {mmW} {mmH} {w} {h} />{/if}
  </div>
  {#if lastMsg}
    <svg class="bubbles" width={w} height={h} viewBox="0 0 {w} {h}" overflow="visible">
      <BubbleShape tip={tipC} num={String(app.chatCounts[chatId] ?? 0)} badge={app.unread[chatId] ?? 0} color={colorFor(lastMsg.author)} u={inv} editable={app.canEdit} testid="card-bubble" attrs={{ 'data-id': o.id }}
        onclick={() => app.openChat(o.id)}
        onwhole={(dx, dy) => saveBubble([tipC[0] + dx, tipC[1] + dy], [bodyC[0] + dx, bodyC[1] + dy])}
        ondragend={() => app.editBoundary()} />
    </svg>
  {/if}
  <!-- 카드가 화면에서 40px 보다 좁으면(많이 축소) 라벨이 서로 겹치므로 숨긴다 -->
  {#if w * zoom >= 40}
  <div class="label" style:transform="scale({inv})">
    <b>{#if sync}<span class="badge sync {sync}" data-testid="card-sync" data-status={sync} title="디자인 싱크 — 받은 파일과의 연결 상태 (확정 전)">{SYNC_STATUS_LABEL[sync]}</span>{/if}{#if changed}<span class="badge change" data-testid="card-change" title="고객 컨펌(발행) 뒤 바뀐 사인물 — 고객이 다시 컨펌하기 전까지 변경안 (견적 탭 [바뀐 내용])">변경안</span>{/if}{#if placeholder}<span class="badge unsized" data-testid="card-unsized" title="가로·세로를 넣으면 실측 크기로 그려집니다">치수 없음</span>{/if}<span class="badge {badge.id}" data-testid="card-badge" data-state={badge.id}>{badge.label}</span>{#if app.voiceCounts[o.sameAs ?? o.id]}<span class="voice" data-testid="card-voice" title="음성 메모 {app.voiceCounts[o.sameAs ?? o.id]}개 — 상세의 🎙">🎙{app.voiceCounts[o.sameAs ?? o.id]}</span>{/if}{linked ? '⇄ ' : ''}{o.name}</b>
    {#if o.widthMm && o.heightMm}<span>{fmt(o.widthMm)} × {fmt(o.heightMm)}{o.depthMm ? ` × ${fmt(o.depthMm)}` : ''} mm</span>{:else}<span class="muted">치수 입력</span>{/if}
    {#if standalone && !linked}<span class="muted">보드 사인물 — 사진의 영역과 연결하세요</span>{/if}
  </div>
  {/if}
</div>

<style>
  .card { position: absolute; cursor: grab; }
  .bubbles { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; z-index: 2; }
  .bubbles :global(.bubble) { pointer-events: auto; }
  .face { position: absolute; inset: 0; overflow: hidden; background: #d9d9d4; outline: 1px solid rgba(255, 255, 255, 0.35); }
  .standalone .face { background: #e8e4d8; outline: 1px dashed color-mix(in srgb, var(--accent) 70%, transparent); }
  /* 디자인 싱크 검토 (2026-11-06): 연결 초록 · 바뀜 파랑 · 누락 주황 */
  [data-sync='link'] .face { outline: calc(3px / var(--z, 1)) solid #22c55e; }
  [data-sync='update'] .face { outline: calc(3px / var(--z, 1)) solid #3b82f6; }
  [data-sync='missing'] .face { outline: calc(3px / var(--z, 1)) dashed #fb923c; }
  .badge.sync.link { background: #166534; color: #fff; } .badge.sync.update { background: #1d4ed8; color: #fff; } .badge.sync.missing { background: #c2410c; color: #fff; }
  .nophoto .face { outline: calc(2px / var(--z, 1)) solid #ef4444; } /* 사진에 없음 (2026-11-05) — 화면 기준 2px */
  .sel .face { outline: 2px solid var(--accent); }
  .multi .face { outline: 2px solid var(--accent); } /* 다중 선택도 진하게 (2026-10-22) */
  /* 고른 카드 테두리는 화면 기준 2.5px — 보드를 축소해도 가늘어지지 않고, 모양으로 잘린 얼굴(clip-path) 밖에 그린다 (2026-10-24 "사인물카드선택시 강조색이 흐리다") */
  .card::after { content: ''; position: absolute; inset: calc(-3px / var(--z, 1)); border: calc(2.5px / var(--z, 1)) solid var(--accent); border-radius: calc(3px / var(--z, 1)); pointer-events: none; display: none; }
  .sel::after, .multi::after { display: block; }
  .face img.flat { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .fill { position: absolute; inset: 0; pointer-events: none; }
  .design { position: absolute; inset: 0; }
  .badge { display: inline-block; margin-right: 5px; padding: 0 5px; border-radius: 4px; font-size: 9px; font-weight: 600; line-height: 14px; vertical-align: 1px; color: var(--muted); border: 1px solid var(--line); }
  .badge.change { color: #fb923c; border-color: #fb923c; } /* 변경안 (2026-11-05) */
  .voice { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: 6px; background: rgba(255, 90, 90, 0.18); color: #ff8a8a; font-size: 10px; font-weight: 700; }
  .badge.settings { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
  .badge.unsized { color: var(--warn); border-color: var(--warn); }
  .badge.design { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
  .label { position: absolute; left: 0; top: 100%; margin-top: 4px; transform-origin: 0 0; display: flex; flex-direction: column; gap: 1px; font-size: 11px; color: var(--text); white-space: nowrap; pointer-events: none; }
  .label b { font-size: 12px; }
  .muted { color: var(--muted); }
</style>
